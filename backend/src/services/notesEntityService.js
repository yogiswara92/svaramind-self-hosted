const { db } = require('../config/db');
const { decrypt } = require('./encryptionService');

const VALID_ENTITY_TYPES = new Set(['person', 'organization', 'date', 'project', 'technology', 'location', 'concept']);

function normalize(name) {
  return (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// ── Phase 1: normalize + persist entities extracted for a document ──────────
// entities: [{ type, value }] as returned by notesAIService.extractEntities().
// Dedupes per workspace by (type, normalized name), so "John Smith" mentioned
// in five different notes becomes one entity linked to five documents instead
// of five disconnected strings.
async function upsertEntitiesForDocument(documentId, workspaceId, userId, entities) {
  if (!Array.isArray(entities) || entities.length === 0) {
    // Nothing mentioned this pass - clear stale mentions from a previous
    // version of this note that no longer applies (edited/shortened, etc).
    await db('notes_document_entities').where({ document_id: documentId }).delete();
    return [];
  }

  const seenEntityIds = new Set();
  const now = db.fn.now();

  for (const raw of entities) {
    const type = VALID_ENTITY_TYPES.has(raw?.type) ? raw.type : 'concept';
    const name = (raw?.value || '').trim();
    if (!name) continue;
    const normalized_name = normalize(name);
    if (!normalized_name) continue;

    let entity = await db('notes_entities')
      .where({ workspace_id: workspaceId, type, normalized_name })
      .first();

    if (entity) {
      await db('notes_entities').where({ id: entity.id }).update({ last_mentioned_at: now, updated_at: now });
    } else {
      const [inserted] = await db('notes_entities').insert({
        workspace_id: workspaceId,
        type,
        name,
        normalized_name,
        created_by: userId
      }).returning('*');
      entity = inserted;
    }

    seenEntityIds.add(entity.id);

    await db('notes_document_entities')
      .insert({ document_id: documentId, entity_id: entity.id, mentioned_at: now })
      .onConflict(['document_id', 'entity_id'])
      .merge({ mentioned_at: now });
  }

  const staleLinks = await db('notes_document_entities')
    .where({ document_id: documentId })
    .whereNotIn('entity_id', [...seenEntityIds])
    .select('entity_id');

  if (staleLinks.length) {
    await db('notes_document_entities')
      .where({ document_id: documentId })
      .whereNotIn('entity_id', [...seenEntityIds])
      .delete();
  }

  const affectedIds = [...new Set([...seenEntityIds, ...staleLinks.map(l => l.entity_id)])];
  if (affectedIds.length) {
    await db.raw(`
      UPDATE notes_entities e
      SET mention_count = (SELECT COUNT(*) FROM notes_document_entities de WHERE de.entity_id = e.id)
      WHERE e.id = ANY(?)
    `, [affectedIds]);
  }

  return [...seenEntityIds];
}

// ── Phase 4: persist extracted relation triples ──────────────────────────────
// relations: [{ subject, relation, object }], all plain-text entity names as
// returned by the LLM - resolved here against entities already upserted for
// this workspace. A new relation sharing (subject, relation) with an active
// one invalidates the old one instead of leaving both around, which is the
// "temporal" behavior: querying facts always returns the newest version, but
// the superseded row stays in place with invalidated_at set, not deleted.
//
// This only makes sense for relations that are naturally single-valued at a
// given time ("works at", "leads" - a person has one current employer/one
// project they lead). Plenty of relations are naturally multi-valued ("uses",
// "mentions", "knows" - a project can use several technologies at once), and
// invalidating the previous one there would just be data loss. Confirmed by
// testing: "Project uses React" then "Project uses Node.js" should be two
// live facts, not one superseding the other - only relations matching the
// singular-ish patterns below get the supersede treatment; everything else
// just accumulates.
const SINGLE_VALUED_RELATION_PATTERN = /\b(works? (at|for)|employ|leads?|lead(ing|s)|manages?|reports? to|ceo of|cto of|president of|director of|head of|married to|lives? (at|in)|located (at|in)|based (at|in)|is (the )?owner of)\b/;

function isSingleValuedRelation(relation) {
  return SINGLE_VALUED_RELATION_PATTERN.test(relation);
}

async function recordRelations(workspaceId, documentId, userId, relations) {
  if (!Array.isArray(relations) || relations.length === 0) return;

  for (const r of relations) {
    const subjectName = normalize(r?.subject);
    const objectName = normalize(r?.object);
    const relation = (r?.relation || '').trim().toLowerCase();
    if (!subjectName || !objectName || !relation || subjectName === objectName) continue;

    const [subjectEntity, objectEntity] = await Promise.all([
      db('notes_entities').where({ workspace_id: workspaceId, normalized_name: subjectName }).first(),
      db('notes_entities').where({ workspace_id: workspaceId, normalized_name: objectName }).first()
    ]);
    if (!subjectEntity || !objectEntity || subjectEntity.id === objectEntity.id) continue;

    const existing = await db('notes_entity_relations')
      .where({ subject_entity_id: subjectEntity.id, relation, object_entity_id: objectEntity.id, invalidated_at: null })
      .first();
    if (existing) continue; // already know this exact fact, nothing to do

    if (isSingleValuedRelation(relation)) {
      await db('notes_entity_relations')
        .where({ subject_entity_id: subjectEntity.id, relation, invalidated_at: null })
        .whereNot({ object_entity_id: objectEntity.id })
        .update({ invalidated_at: db.fn.now() });
    }

    await db('notes_entity_relations').insert({
      workspace_id: workspaceId,
      subject_entity_id: subjectEntity.id,
      relation,
      object_entity_id: objectEntity.id,
      source_document_id: documentId,
      created_by: userId
    });
  }
}

// ── Phase 3: structured entity lookup for AI chat context ───────────────────
// Complements embedding-similarity RAG (getCrossNoteChunks) rather than
// replacing it - an exact "what do we know about X" question doesn't always
// score high enough on chunk similarity alone, but a plain name match against
// the entity table catches it with full precision.
async function getEntityContextForQuery(query, workspaceId, userId, excludeDocId, limit = 3) {
  if (!query || query.trim().length < 2) return null;

  const entities = await db('notes_entities').where({ workspace_id: workspaceId }).select('id', 'name', 'normalized_name', 'type');
  if (!entities.length) return null;

  const q = normalize(query);
  const matched = entities.filter(e => e.normalized_name.length >= 3 && q.includes(e.normalized_name));
  if (!matched.length) return null;

  const entityIds = matched.map(e => e.id);
  const links = await db('notes_document_entities').whereIn('entity_id', entityIds).select('document_id');
  if (!links.length) return null;

  const docIds = [...new Set(links.map(l => l.document_id))].filter(id => id !== excludeDocId);
  if (!docIds.length) return null;

  const docs = await db('notes_documents')
    .whereIn('id', docIds)
    .where({ workspace_id: workspaceId, created_by: userId, is_archived: false })
    .select('id', 'title', 'content_text')
    .limit(limit);
  if (!docs.length) return null;

  const matchedNames = matched.map(e => e.name).join(', ');
  const sources = docs.map(d => ({
    documentId: d.id,
    title: decrypt(d.title),
    chunkText: decrypt(d.content_text || '').slice(0, 1500),
    isCrossNote: true,
    isEntityMatch: true
  }));
  let context = sources
    .map(s => `[From note "${s.title}", matched entity: ${matchedNames}]\n${s.chunkText}`)
    .join('\n\n---\n\n');

  const relRows = await db('notes_entity_relations')
    .whereIn('subject_entity_id', entityIds)
    .whereNull('invalidated_at')
    .select('subject_entity_id', 'relation', 'object_entity_id');

  if (relRows.length) {
    const objIds = relRows.map(r => r.object_entity_id);
    const objEntities = await db('notes_entities').whereIn('id', objIds).select('id', 'name');
    const nameById = Object.fromEntries(objEntities.map(e => [e.id, e.name]));
    const subjNameById = Object.fromEntries(matched.map(e => [e.id, e.name]));
    const facts = relRows.map(r => `${subjNameById[r.subject_entity_id] || '?'} ${r.relation} ${nameById[r.object_entity_id] || '?'}`);
    if (facts.length) context += `\n\n[Known facts]\n${facts.join('\n')}`;
  }

  return { context, sources };
}

// ── Phase 2: entities + edges for the knowledge graph view ──────────────────
async function getEntitiesForGraph(workspaceId, docIds) {
  if (!docIds.length) return { nodes: [], edges: [] };

  const links = await db('notes_document_entities').whereIn('document_id', docIds).select('document_id', 'entity_id');
  if (!links.length) return { nodes: [], edges: [] };

  const entityIds = [...new Set(links.map(l => l.entity_id))];
  const entities = await db('notes_entities').whereIn('id', entityIds).select('id', 'type', 'name', 'mention_count');

  const relations = await db('notes_entity_relations')
    .where({ workspace_id: workspaceId })
    .whereNull('invalidated_at')
    .whereIn('subject_entity_id', entityIds)
    .select('subject_entity_id', 'relation', 'object_entity_id');

  // Only surface entities that connect at least two notes, or are part of a
  // known relation - a concept mentioned exactly once doesn't add anything
  // useful to the graph, just clutter.
  const mentionCounts = {};
  for (const l of links) mentionCounts[l.entity_id] = (mentionCounts[l.entity_id] || 0) + 1;

  const relevantIds = new Set([
    ...Object.keys(mentionCounts).filter(id => mentionCounts[id] >= 2),
    ...relations.flatMap(r => [r.subject_entity_id, r.object_entity_id])
  ]);

  const nodes = entities
    .filter(e => relevantIds.has(e.id))
    .map(e => ({ id: `entity:${e.id}`, label: e.name, type: 'entity', entityType: e.type, mention_count: e.mention_count }));

  const edges = [];
  for (const l of links) {
    if (relevantIds.has(l.entity_id)) {
      edges.push({ source: l.document_id, target: `entity:${l.entity_id}`, type: 'mentions' });
    }
  }
  for (const r of relations) {
    if (relevantIds.has(r.subject_entity_id) && relevantIds.has(r.object_entity_id)) {
      edges.push({ source: `entity:${r.subject_entity_id}`, target: `entity:${r.object_entity_id}`, type: 'relation', label: r.relation });
    }
  }

  return { nodes, edges };
}

// ── Phase 2: click-through - which notes mention this entity ────────────────
async function getDocumentsForEntity(entityId, workspaceId, userId) {
  const entity = await db('notes_entities').where({ id: entityId, workspace_id: workspaceId }).first();
  if (!entity) return null;

  const links = await db('notes_document_entities').where({ entity_id: entityId }).select('document_id');
  const docIds = links.map(l => l.document_id);

  const docs = docIds.length
    ? await db('notes_documents')
        .whereIn('id', docIds)
        .where({ workspace_id: workspaceId, created_by: userId, is_archived: false })
        .select('id', 'title', 'icon', 'updated_at')
        .orderBy('updated_at', 'desc')
    : [];

  return {
    entity: { id: entity.id, name: entity.name, type: entity.type, mention_count: entity.mention_count },
    documents: docs.map(d => ({ id: d.id, title: decrypt(d.title), icon: d.icon, updated_at: d.updated_at }))
  };
}

module.exports = {
  upsertEntitiesForDocument,
  recordRelations,
  getEntityContextForQuery,
  getEntitiesForGraph,
  getDocumentsForEntity
};
