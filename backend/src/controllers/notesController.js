const { db } = require('../config/db');
const storage = require('../services/storage');
const { indexDocumentAsync } = require('../services/notesEmbeddingService');
const { getEntitiesForGraph, getDocumentsForEntity } = require('../services/notesEntityService');
const { encryptDocument, decryptDocument, decrypt } = require('../services/encryptionService');
const { assertWorkspaceAccess, assertWorkspaceOwner, assertDocumentAccess, assertFolderAccess, handleError } = require('../services/authz');

// Extract human-readable labels + connections from Draw.io XML for RAG indexing
function extractDrawioText(xml) {
  if (!xml) return '';
  if (!xml.trimStart().startsWith('<mxGraphModel')) {
    try {
      const zlib = require('zlib');
      const m = /<diagram[^>]*>([^<]+)<\/diagram>/i.exec(xml);
      if (m) xml = zlib.inflateRawSync(Buffer.from(decodeURIComponent(m[1]), 'base64')).toString('utf-8');
    } catch {}
  }
  const nodes = {};
  const edges = [];
  const cellRe = /<mxCell([^>]*)\/?>(?:<mxGeometry[^/]*\/>)?(?:<\/mxCell>)?/g;
  let cm;
  while ((cm = cellRe.exec(xml)) !== null) {
    const attrs = {};
    const localRe = /(\w+)="([^"]*)"/g;
    let a;
    while ((a = localRe.exec(cm[1])) !== null) attrs[a[1]] = a[2];
    if (attrs.vertex === '1' && attrs.id && attrs.id !== '0' && attrs.id !== '1')
      nodes[attrs.id] = (attrs.value || '').trim();
    if (attrs.edge === '1')
      edges.push({ source: attrs.source, target: attrs.target, label: (attrs.value || '').trim() });
  }
  const nodeLabels = Object.values(nodes).filter(v => v && v !== '0' && v !== '1');
  const connections = edges.map(e => {
    const from = nodes[e.source] || e.source;
    const to = nodes[e.target] || e.target;
    return e.label ? `${from} --[${e.label}]--> ${to}` : `${from} --> ${to}`;
  });
  if (!nodeLabels.length) return '';
  let text = `\nDiagram nodes: ${nodeLabels.join(', ')}`;
  if (connections.length) text += `\nDiagram connections: ${connections.join(' | ')}`;
  return text;
}

function extractDiagramsFromContent(content) {
  const xmls = [];
  function walk(node) {
    if (!node) return;
    if (node.type === 'drawio' && node.attrs?.xml) xmls.push(node.attrs.xml);
    if (node.content) node.content.forEach(walk);
  }
  walk(content);
  return xmls.join('\n\n');
}

// Attach `notes_document_tags: [{tag_id, notes_tags:{id,name,color}}]` to each
// document, matching the shape the frontend already expects (EditNoteModal,
// NotesHomePage, GraphVisualization read doc.notes_document_tags[].notes_tags).
async function attachTags(docs) {
  const docIds = docs.map(d => d.id);
  if (!docIds.length) return docs;
  const rows = await db('notes_document_tags as dt')
    .join('notes_tags as t', 't.id', 'dt.tag_id')
    .whereIn('dt.document_id', docIds)
    .select('dt.document_id', 'dt.tag_id', 't.id as tag_id_full', 't.name', 't.color');
  const byDoc = {};
  for (const r of rows) {
    (byDoc[r.document_id] ||= []).push({ tag_id: r.tag_id, notes_tags: { id: r.tag_id_full, name: r.name, color: r.color } });
  }
  return docs.map(d => ({ ...d, notes_document_tags: byDoc[d.id] || [] }));
}

// ── Workspaces ────────────────────────────────────────────────────────────────

async function getWorkspaces(req, res) {
  try {
    const userId = req.user.id;
    const data = await db('notes_workspaces').where({ owner_id: userId }).orderBy('created_at', 'asc');
    res.json({ workspaces: data });
  } catch (err) { handleError(res, err, 'getWorkspaces'); }
}

async function createWorkspace(req, res) {
  try {
    const userId = req.user.id;
    const { name, description, icon, color } = req.body;

    const [data] = await db('notes_workspaces')
      .insert({ name, description, icon: icon || 'bi-journals', color: color || '#6c63ff', owner_id: userId })
      .returning('*');

    await db('notes_settings')
      .insert({ user_id: userId, default_workspace_id: data.id })
      .onConflict('user_id')
      .ignore();

    res.status(201).json({ workspace: data });
  } catch (err) { handleError(res, err, 'createWorkspace'); }
}

async function updateWorkspace(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const updates = { ...req.body };
    delete updates.owner_id;

    const [data] = await db('notes_workspaces').where({ id, owner_id: userId }).update(updates).returning('*');
    if (!data) return res.status(404).json({ error: 'Workspace not found' });
    res.json({ workspace: data });
  } catch (err) { handleError(res, err, 'updateWorkspace'); }
}

async function deleteWorkspace(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    await db('notes_workspaces').where({ id, owner_id: userId }).delete();
    res.json({ success: true });
  } catch (err) { handleError(res, err, 'deleteWorkspace'); }
}

// ── Folders ────────────────────────────────────────────────────────────────

async function getFolders(req, res) {
  try {
    const userId = req.user.id;
    const { workspaceId } = req.params;
    await assertWorkspaceAccess(workspaceId, userId);

    const data = await db('notes_folders').where({ workspace_id: workspaceId }).orderBy('sort_order', 'asc');
    res.json({ folders: data });
  } catch (err) { handleError(res, err, 'getFolders'); }
}

async function createFolder(req, res) {
  try {
    const userId = req.user.id;
    const { workspace_id, parent_id, name, icon, color } = req.body;
    await assertWorkspaceAccess(workspace_id, userId);

    const [data] = await db('notes_folders')
      .insert({ workspace_id, parent_id, name, icon: icon || 'bi-folder2', color, created_by: userId })
      .returning('*');
    res.status(201).json({ folder: data });
  } catch (err) { handleError(res, err, 'createFolder'); }
}

async function updateFolder(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    await assertFolderAccess(id, userId);

    const updates = { ...req.body };
    delete updates.workspace_id;
    delete updates.created_by;

    const [data] = await db('notes_folders').where({ id }).update(updates).returning('*');
    res.json({ folder: data });
  } catch (err) { handleError(res, err, 'updateFolder'); }
}

async function deleteFolder(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    await assertFolderAccess(id, userId);

    await db('notes_folders').where({ id }).delete();
    res.json({ success: true });
  } catch (err) { handleError(res, err, 'deleteFolder'); }
}

// ── Documents ────────────────────────────────────────────────────────────────

async function getDocuments(req, res) {
  try {
    const userId = req.user.id;
    const { workspaceId } = req.params;
    const { folder_id, archived, pinned, limit = 50, offset = 0 } = req.query;
    await assertWorkspaceAccess(workspaceId, userId);

    let query = db('notes_documents')
      .select('id', 'title', 'icon', 'cover_image', 'folder_id', 'is_pinned', 'is_archived',
        'word_count', 'read_time_minutes', 'views', 'created_by', 'last_edited_by',
        'created_at', 'updated_at', 'is_encrypted')
      .where({ workspace_id: workspaceId, created_by: userId });

    if (folder_id && folder_id !== 'null') query = query.where({ folder_id });
    else if (folder_id === 'null') query = query.whereNull('folder_id');

    query = query.where({ is_archived: archived === 'true' });
    if (pinned === 'true') query = query.where({ is_pinned: true });

    const data = await query.orderBy('updated_at', 'desc').limit(parseInt(limit)).offset(parseInt(offset));
    const withTags = await attachTags(data);
    res.json({ documents: withTags.map(decryptDocument) });
  } catch (err) { handleError(res, err, 'getDocuments'); }
}

async function getDocument(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const doc = await assertDocumentAccess(id, userId);

    const [tagged] = await attachTags([doc]);
    const insights = await db('notes_ai_insights')
      .where({ document_id: id })
      .select('summary', 'key_entities', 'auto_tags', 'action_items', 'key_points', 'topics', 'questions', 'processing_status')
      .first();

    await db('notes_documents').where({ id }).update({ views: (doc.views || 0) + 1 });

    res.json({ document: decryptDocument({ ...tagged, notes_ai_insights: insights ? [insights] : [] }) });
  } catch (err) { handleError(res, err, 'getDocument'); }
}

async function createDocument(req, res) {
  try {
    const userId = req.user.id;
    const { workspace_id, folder_id, title, content, content_text, content_html, icon } = req.body;
    await assertWorkspaceAccess(workspace_id, userId);

    const wordCount = content_text ? content_text.split(/\s+/).filter(Boolean).length : 0;

    const plainDoc = {
      workspace_id,
      folder_id: folder_id || null,
      title: title || 'Untitled',
      content: content || { type: 'doc', content: [{ type: 'paragraph' }] },
      content_text: content_text || '',
      content_html: content_html || '',
      icon: icon || 'bi-file-text',
      word_count: wordCount,
      read_time_minutes: Math.max(1, Math.round(wordCount / 200)),
      created_by: userId,
      last_edited_by: userId
    };

    const [data] = await db('notes_documents').insert(encryptDocument(plainDoc)).returning('*');
    await db('notes_ai_insights').insert({ document_id: data.id, processing_status: 'pending' });

    if (content_text && content_text.length > 50) {
      indexDocumentAsync(data.id, content_text, userId);
    }

    res.status(201).json({ document: decryptDocument(data) });
  } catch (err) { handleError(res, err, 'createDocument'); }
}

async function updateDocument(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const existing = await assertDocumentAccess(id, userId, { write: true });
    const { title, content, content_text, content_html, folder_id, icon, cover_image, is_pinned, is_archived, is_public, published_at, public_slug, excerpt, diagram_xml, diagram_svg, reindex } = req.body;

    const updates = { last_edited_by: userId };
    if (title !== undefined) updates.title = title;
    if (content !== undefined) updates.content = content;
    if (content_text !== undefined) {
      updates.content_text = content_text;
      const wordCount = content_text.split(/\s+/).filter(Boolean).length;
      updates.word_count = wordCount;
      updates.read_time_minutes = Math.max(1, Math.round(wordCount / 200));
    }
    if (content_html !== undefined) updates.content_html = content_html;
    if (folder_id !== undefined) updates.folder_id = folder_id;
    if (icon !== undefined) updates.icon = icon;
    if (cover_image !== undefined) updates.cover_image = cover_image;
    if (is_pinned !== undefined) updates.is_pinned = is_pinned;
    if (is_archived !== undefined) updates.is_archived = is_archived;
    if (is_public !== undefined) updates.is_public = is_public;
    if (published_at !== undefined) updates.published_at = published_at;
    if (public_slug !== undefined) updates.public_slug = public_slug;
    if (excerpt !== undefined) updates.excerpt = excerpt;
    if (diagram_xml !== undefined) updates.diagram_xml = diagram_xml;
    if (diagram_svg !== undefined) updates.diagram_svg = diagram_svg;

    const [data] = await db('notes_documents').where({ id }).update(encryptDocument(updates)).returning('*');
    const decrypted = decryptDocument(data);

    let ragStatus = null;
    if (reindex === true && content_text !== undefined && content_text.length > 50) {
      const contentDiagrams = content !== undefined ? extractDiagramsFromContent(content) : '';
      const legacyXml = diagram_xml !== undefined ? diagram_xml : (existing.diagram_xml || '');
      const allDiagramXml = contentDiagrams || legacyXml;
      const diagramText = extractDrawioText(allDiagramXml);
      ragStatus = indexDocumentAsync(id, content_text + diagramText, userId);
    }

    res.json({ document: decrypted, rag: ragStatus });
  } catch (err) { handleError(res, err, 'updateDocument'); }
}

async function deleteDocument(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const doc = await assertDocumentAccess(id, userId, { write: true });
    if (doc.created_by !== userId) return res.status(403).json({ error: 'Only the document creator can delete it' });

    if (doc.workspace_id) {
      const folderPath = `documents/${doc.workspace_id}/${id}`;
      const files = await storage.listFiles(folderPath);
      if (files?.length) {
        const filePaths = files.map(f => `${folderPath}/${f.name}`);
        await storage.removeFiles(filePaths);
      }
    }

    await db('notes_documents').where({ id }).delete();
    res.json({ success: true });
  } catch (err) { handleError(res, err, 'deleteDocument'); }
}

async function saveVersion(req, res) {
  try {
    const userId = req.user.id;
    const { id: documentId } = req.params;
    await assertDocumentAccess(documentId, userId, { write: true });
    const { title, content, content_text, content_html, change_summary } = req.body;

    const versions = await db('notes_document_versions')
      .where({ document_id: documentId })
      .orderBy('version_number', 'desc')
      .limit(1);

    const nextVersion = versions.length > 0 ? versions[0].version_number + 1 : 1;
    const wordCount = content_text ? content_text.split(/\s+/).filter(Boolean).length : 0;

    const { is_encrypted: _drop, ...encVersion } = encryptDocument({ title, content, content_text, content_html });

    const [data] = await db('notes_document_versions')
      .insert({ document_id: documentId, version_number: nextVersion, ...encVersion, word_count: wordCount, change_summary, created_by: userId })
      .returning('*');

    res.status(201).json({ version: data });
  } catch (err) { handleError(res, err, 'saveVersion'); }
}

async function getVersions(req, res) {
  try {
    const userId = req.user.id;
    const { id: documentId } = req.params;
    await assertDocumentAccess(documentId, userId);

    const data = await db('notes_document_versions')
      .where({ document_id: documentId })
      .select('id', 'version_number', 'title', 'word_count', 'change_summary', 'created_by', 'created_at')
      .orderBy('version_number', 'desc');

    res.json({ versions: data.map(v => ({ ...v, title: decrypt(v.title) })) });
  } catch (err) { handleError(res, err, 'getVersions'); }
}

async function restoreVersion(req, res) {
  try {
    const userId = req.user.id;
    const { id: documentId, versionId } = req.params;
    await assertDocumentAccess(documentId, userId, { write: true });

    const version = await db('notes_document_versions').where({ id: versionId, document_id: documentId }).first();
    if (!version) return res.status(404).json({ error: 'Version not found' });

    const decVersion = decryptDocument(version);
    const encUpdates = encryptDocument({
      title: decVersion.title,
      content: decVersion.content,
      content_text: decVersion.content_text,
      content_html: decVersion.content_html
    });

    const [data] = await db('notes_documents')
      .where({ id: documentId })
      .update({ ...encUpdates, word_count: version.word_count, last_edited_by: userId })
      .returning('*');

    res.json({ document: decryptDocument(data) });
  } catch (err) { handleError(res, err, 'restoreVersion'); }
}

// ── Tags ────────────────────────────────────────────────────────────────

async function getTags(req, res) {
  try {
    const userId = req.user.id;
    const { workspaceId } = req.params;
    await assertWorkspaceAccess(workspaceId, userId);

    const data = await db('notes_tags').where({ workspace_id: workspaceId }).orderBy('name', 'asc');
    res.json({ tags: data });
  } catch (err) { handleError(res, err, 'getTags'); }
}

async function createTag(req, res) {
  try {
    const userId = req.user.id;
    const { workspace_id, name, color } = req.body;
    await assertWorkspaceAccess(workspace_id, userId);

    const [data] = await db('notes_tags')
      .insert({ workspace_id, name, color: color || '#6c757d', created_by: userId })
      .returning('*');
    res.status(201).json({ tag: data });
  } catch (err) { handleError(res, err, 'createTag'); }
}

async function setDocumentTags(req, res) {
  try {
    const userId = req.user.id;
    const { id: documentId } = req.params;
    const { tag_ids } = req.body;
    await assertDocumentAccess(documentId, userId, { write: true });

    await db.transaction(async (trx) => {
      await trx('notes_document_tags').where({ document_id: documentId }).delete();
      if (tag_ids && tag_ids.length > 0) {
        await trx('notes_document_tags').insert(tag_ids.map(tag_id => ({ document_id: documentId, tag_id })));
      }
    });

    res.json({ success: true });
  } catch (err) { handleError(res, err, 'setDocumentTags'); }
}

// ── Comments ────────────────────────────────────────────────────────────────

async function getComments(req, res) {
  try {
    const userId = req.user.id;
    const { id: documentId } = req.params;
    await assertDocumentAccess(documentId, userId);

    const rows = await db('notes_comments as c')
      .leftJoin('profiles as p', 'p.id', 'c.created_by')
      .where('c.document_id', documentId)
      .orderBy('c.created_at', 'asc')
      .select('c.*', 'p.id as author_id', 'p.full_name as author_full_name', 'p.avatar_url as author_avatar_url');

    const comments = rows.map(({ author_id, author_full_name, author_avatar_url, ...c }) => ({
      ...c,
      profiles: { id: author_id, full_name: author_full_name, avatar_url: author_avatar_url }
    }));

    res.json({ comments });
  } catch (err) { handleError(res, err, 'getComments'); }
}

async function addComment(req, res) {
  try {
    const userId = req.user.id;
    const { id: documentId } = req.params;
    await assertDocumentAccess(documentId, userId);
    const { content, parent_id, anchor_text, anchor_from, anchor_to } = req.body;

    const [data] = await db('notes_comments')
      .insert({ document_id: documentId, content, parent_id, anchor_text, anchor_from, anchor_to, created_by: userId })
      .returning('*');
    res.status(201).json({ comment: data });
  } catch (err) { handleError(res, err, 'addComment'); }
}

async function resolveComment(req, res) {
  try {
    const userId = req.user.id;
    const { commentId } = req.params;

    const comment = await db('notes_comments').where({ id: commentId }).first();
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    await assertDocumentAccess(comment.document_id, userId, { write: true });

    const [data] = await db('notes_comments')
      .where({ id: commentId })
      .update({ is_resolved: true, resolved_by: userId, resolved_at: db.fn.now() })
      .returning('*');
    res.json({ comment: data });
  } catch (err) { handleError(res, err, 'resolveComment'); }
}

// ── Search ────────────────────────────────────────────────────────────────

async function searchDocuments(req, res) {
  try {
    const userId = req.user.id;
    const { q, workspace_id, limit = 20 } = req.query;
    if (!q || !workspace_id) return res.status(400).json({ error: 'q and workspace_id required' });
    await assertWorkspaceAccess(workspace_id, userId);

    const data = await db('notes_documents')
      .where({ workspace_id, created_by: userId, is_archived: false })
      .select('id', 'title', 'content_text', 'icon', 'folder_id', 'updated_at', 'word_count');

    const tagged = await attachTags(data);
    const lower = q.toLowerCase();
    const results = tagged
      .map(doc => ({ ...doc, title: decrypt(doc.title) || '', content_text: decrypt(doc.content_text) || '' }))
      .filter(doc => doc.title.toLowerCase().includes(lower) || doc.content_text.toLowerCase().includes(lower))
      .slice(0, parseInt(limit))
      .map(doc => ({
        id: doc.id,
        title: doc.title,
        icon: doc.icon,
        folder_id: doc.folder_id,
        updated_at: doc.updated_at,
        word_count: doc.word_count,
        tags: doc.notes_document_tags,
        snippet: (() => {
          const idx = doc.content_text.toLowerCase().indexOf(lower);
          if (idx === -1) return doc.content_text.slice(0, 160);
          return doc.content_text.slice(Math.max(0, idx - 60), idx + 120);
        })()
      }));

    res.json({ results });
  } catch (err) { handleError(res, err, 'searchDocuments'); }
}

// ── Settings ────────────────────────────────────────────────────────────────

async function getSettings(req, res) {
  try {
    const userId = req.user.id;
    let data = await db('notes_settings').where({ user_id: userId }).first();
    if (!data) {
      [data] = await db('notes_settings').insert({ user_id: userId }).onConflict('user_id').merge().returning('*');
    }
    res.json({ settings: data });
  } catch (err) { handleError(res, err, 'getSettings'); }
}

async function updateSettings(req, res) {
  try {
    const userId = req.user.id;
    const updates = { ...req.body };
    delete updates.user_id;
    delete updates.id;
    delete updates.created_at;
    delete updates.updated_at;
    // node-postgres serializes plain JS arrays as Postgres ARRAY literals,
    // not JSON, when bound as query params - jsonb *array* columns need an
    // explicit JSON.stringify first (plain object columns like `content`
    // don't have this problem, pg stringifies those automatically).
    if (Array.isArray(updates.llm_configs)) updates.llm_configs = JSON.stringify(updates.llm_configs);

    const [data] = await db('notes_settings')
      .insert({ ...updates, user_id: userId })
      .onConflict('user_id')
      .merge()
      .returning('*');
    res.json({ settings: data });
  } catch (err) { handleError(res, err, 'updateSettings'); }
}

// ── Collaborators / Sharing ────────────────────────────────────────────────

async function getCollaborators(req, res) {
  try {
    const userId = req.user.id;
    const { id: documentId } = req.params;
    await assertDocumentAccess(documentId, userId);

    const rows = await db('notes_document_collaborators as dc')
      .leftJoin('profiles as p', 'p.id', 'dc.user_id')
      .where('dc.document_id', documentId)
      .select('dc.*', 'p.full_name', 'p.avatar_url', 'p.email as profile_email');

    const collaborators = rows.map(({ full_name, avatar_url, profile_email, ...c }) => ({
      ...c, profiles: { full_name, avatar_url, email: profile_email }
    }));
    res.json({ collaborators });
  } catch (err) { handleError(res, err, 'getCollaborators'); }
}

async function addCollaborator(req, res) {
  try {
    const userId = req.user.id;
    const { id: documentId } = req.params;
    const doc = await assertDocumentAccess(documentId, userId, { write: true });
    if (doc.created_by !== userId) return res.status(403).json({ error: 'Only the document owner can add collaborators' });
    const { email, role } = req.body;

    const profile = await db('profiles').where({ email }).first();
    if (!profile) return res.status(404).json({ error: 'User not found with that email' });

    const [data] = await db('notes_document_collaborators')
      .insert({ document_id: documentId, workspace_id: doc.workspace_id, user_id: profile.id, email, role, invited_by: userId })
      .onConflict(['document_id', 'user_id'])
      .merge(['role'])
      .returning('*');

    res.status(201).json({ collaborator: data });
  } catch (err) { handleError(res, err, 'addCollaborator'); }
}

async function removeCollaborator(req, res) {
  try {
    const userId = req.user.id;
    const { id: documentId, collaboratorId } = req.params;
    const doc = await assertDocumentAccess(documentId, userId, { write: true });
    if (doc.created_by !== userId) return res.status(403).json({ error: 'Only the document owner can remove collaborators' });

    await db('notes_document_collaborators').where({ id: collaboratorId, document_id: documentId }).delete();
    res.json({ success: true });
  } catch (err) { handleError(res, err, 'removeCollaborator'); }
}

// ── Templates ────────────────────────────────────────────────────────────────

async function getTemplates(req, res) {
  try {
    const userId = req.user.id;
    const { workspace_id } = req.query;

    let query = db('notes_templates').orderBy('use_count', 'desc');
    if (workspace_id) {
      await assertWorkspaceAccess(workspace_id, userId);
      query = query.where(function () { this.where({ workspace_id }).orWhere({ is_public: true }); });
    } else {
      query = query.where(function () { this.where({ created_by: userId }).orWhere({ is_public: true }); });
    }

    const data = await query;
    res.json({ templates: data });
  } catch (err) { handleError(res, err, 'getTemplates'); }
}

async function createTemplate(req, res) {
  try {
    const userId = req.user.id;
    const { workspace_id, name, description, content, content_html, icon, category, is_public } = req.body;

    const [data] = await db('notes_templates')
      .insert({ workspace_id, name, description, content, content_html, icon, category, is_public, created_by: userId })
      .returning('*');
    res.status(201).json({ template: data });
  } catch (err) { handleError(res, err, 'createTemplate'); }
}

async function updateTemplate(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { name, description, content, content_html, icon, category, is_public } = req.body;

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (content !== undefined) updates.content = content;
    if (content_html !== undefined) updates.content_html = content_html;
    if (icon !== undefined) updates.icon = icon;
    if (category !== undefined) updates.category = category;
    if (is_public !== undefined) updates.is_public = is_public;

    const [data] = await db('notes_templates').where({ id, created_by: userId }).update(updates).returning('*');
    if (!data) return res.status(404).json({ error: 'Template not found' });
    res.json({ template: data });
  } catch (err) { handleError(res, err, 'updateTemplate'); }
}

async function deleteTemplate(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    await db('notes_templates').where({ id, created_by: userId }).delete();
    res.json({ success: true });
  } catch (err) { handleError(res, err, 'deleteTemplate'); }
}

// ── Attachments ────────────────────────────────────────────────────────────────

async function uploadAttachment(req, res) {
  try {
    const userId = req.user.id;
    const { id: documentId } = req.params;
    const doc = await assertDocumentAccess(documentId, userId, { write: true });
    const { file_name, file_type, file_size, storage_path, public_url } = req.body;

    const [data] = await db('notes_attachments')
      .insert({ document_id: documentId, workspace_id: doc.workspace_id, file_name, file_type, file_size, storage_path, public_url, created_by: userId })
      .returning('*');
    res.status(201).json({ attachment: data });
  } catch (err) { handleError(res, err, 'uploadAttachment'); }
}

// ── Graph data ────────────────────────────────────────────────────────────────

async function getGraphData(req, res) {
  try {
    const userId = req.user.id;
    const { workspaceId } = req.params;
    await assertWorkspaceAccess(workspaceId, userId);

    const docs = await db('notes_documents')
      .where({ workspace_id: workspaceId, created_by: userId, is_archived: false })
      .select('id', 'title', 'icon', 'folder_id', 'word_count', 'updated_at', 'is_encrypted');
    const taggedDocs = await attachTags(docs);

    const nodes = taggedDocs.map(d => ({
      id: d.id,
      label: decrypt(d.title),
      icon: d.icon,
      folder_id: d.folder_id,
      word_count: d.word_count,
      tags: (d.notes_document_tags || []).map(t => t.notes_tags),
      updated_at: d.updated_at
    }));

    const docIds = docs.map(d => d.id);
    const edges = [];

    const links = docIds.length ? await db('notes_document_links').whereIn('source_document_id', docIds) : [];
    for (const link of links) {
      if (docIds.includes(link.target_document_id)) {
        edges.push({ source: link.source_document_id, target: link.target_document_id, type: 'wikilink' });
      }
    }

    const insights = docIds.length ? await db('notes_ai_insights').whereIn('document_id', docIds).select('document_id', 'related_doc_ids') : [];
    for (const insight of insights) {
      for (const relId of insight.related_doc_ids || []) {
        if (docIds.includes(relId)) {
          const exists = edges.some(e =>
            (e.source === insight.document_id && e.target === relId) ||
            (e.source === relId && e.target === insight.document_id));
          if (!exists) edges.push({ source: insight.document_id, target: relId, type: 'related' });
        }
      }
    }

    for (const doc of docs) {
      if (doc.folder_id) {
        const siblings = docs.filter(d => d.folder_id === doc.folder_id && d.id !== doc.id);
        for (const sib of siblings) {
          if (!edges.some(e => (e.source === doc.id && e.target === sib.id) || (e.source === sib.id && e.target === doc.id))) {
            edges.push({ source: doc.id, target: sib.id, type: 'folder' });
          }
        }
      }
    }

    // Knowledge-graph RAG entities: adds entity nodes (people/orgs/projects/
    // etc extracted from note content) and "mentions"/"relation" edges on
    // top of the document-only graph above.
    const entityGraph = await getEntitiesForGraph(workspaceId, docIds).catch(() => ({ nodes: [], edges: [] }));

    res.json({
      nodes: [...nodes, ...entityGraph.nodes],
      edges: [...edges, ...entityGraph.edges]
    });
  } catch (err) { handleError(res, err, 'getGraphData'); }
}

async function getEntityDocuments(req, res) {
  try {
    const userId = req.user.id;
    const { workspaceId, entityId } = req.params;
    await assertWorkspaceAccess(workspaceId, userId);

    const result = await getDocumentsForEntity(entityId, workspaceId, userId);
    if (!result) return res.status(404).json({ error: 'Entity not found' });

    res.json(result);
  } catch (err) { handleError(res, err, 'getEntityDocuments'); }
}

// ── Backlinks ─────────────────────────────────────────────────────────────────

async function getBacklinks(req, res) {
  try {
    const userId = req.user.id;
    const { id: documentId } = req.params;
    await assertDocumentAccess(documentId, userId);

    const rows = await db('notes_document_links as l')
      .join('notes_documents as d', 'd.id', 'l.source_document_id')
      .where('l.target_document_id', documentId)
      .select('d.id', 'd.title', 'd.icon', 'd.updated_at', 'd.content', 'd.content_text', 'd.content_html');

    const backlinks = rows.map(decryptDocument);
    res.json({ backlinks });
  } catch (err) { handleError(res, err, 'getBacklinks'); }
}

async function syncLinks(req, res) {
  try {
    const userId = req.user.id;
    const { id: sourceId } = req.params;
    await assertDocumentAccess(sourceId, userId, { write: true });
    const { linked_doc_ids = [] } = req.body;

    await db.transaction(async (trx) => {
      await trx('notes_document_links').where({ source_document_id: sourceId }).delete();
      if (linked_doc_ids.length > 0) {
        await trx('notes_document_links').insert(linked_doc_ids.map(target_id => ({ source_document_id: sourceId, target_document_id: target_id })));
      }
    });

    res.json({ success: true });
  } catch (err) { handleError(res, err, 'syncLinks'); }
}

async function searchByTitle(req, res) {
  try {
    const userId = req.user.id;
    const { q, workspace_id } = req.query;
    if (!q || !workspace_id) return res.json({ documents: [] });
    await assertWorkspaceAccess(workspace_id, userId);

    const data = await db('notes_documents')
      .where({ workspace_id, created_by: userId, is_archived: false })
      .whereILike('title', `%${q}%`)
      .select('id', 'title', 'icon')
      .limit(10);

    res.json({ documents: data.map(d => ({ ...d, title: decrypt(d.title) })) });
  } catch (err) { handleError(res, err, 'searchByTitle'); }
}

// ── Public Blog (no auth) ────────────────────────────────────────────────────

async function getBlogProfile(req, res) {
  try {
    const { username } = req.params;
    const profile = await db('profiles').where({ username }).select('id', 'username', 'full_name', 'avatar_url').first();
    if (!profile) return res.status(404).json({ error: 'Blog not found' });

    const settings = await db('notes_settings').where({ user_id: profile.id }).select('blog_bio').first();

    const docs = await db('notes_documents')
      .where({ created_by: profile.id, is_archived: false })
      .whereNotNull('published_at')
      .select('id', 'title', 'excerpt', 'cover_image', 'public_slug', 'published_at', 'read_time_minutes', 'word_count', 'views')
      .orderBy('published_at', 'desc');

    const articles = docs.map(decryptDocument);
    res.json({ profile: { ...profile, blog_bio: settings?.blog_bio || null }, articles });
  } catch (err) { handleError(res, err, 'getBlogProfile'); }
}

async function getBlogPost(req, res) {
  try {
    const { username, slug } = req.params;
    const profile = await db('profiles').where({ username }).select('id', 'username', 'full_name', 'avatar_url').first();
    if (!profile) return res.status(404).json({ error: 'Blog not found' });

    const settings = await db('notes_settings').where({ user_id: profile.id }).select('blog_bio').first();

    const doc = await db('notes_documents')
      .where({ created_by: profile.id, public_slug: slug })
      .whereNotNull('published_at')
      .select('id', 'title', 'excerpt', 'cover_image', 'public_slug', 'published_at', 'read_time_minutes', 'word_count', 'views', 'content_html')
      .first();

    if (!doc) return res.status(404).json({ error: 'Article not found' });

    db('notes_documents').where({ id: doc.id }).update({ views: (doc.views || 0) + 1 }).then(() => {});

    res.json({ profile: { ...profile, blog_bio: settings?.blog_bio || null }, article: decryptDocument(doc) });
  } catch (err) { handleError(res, err, 'getBlogPost'); }
}

module.exports = {
  getBlogProfile, getBlogPost,
  getWorkspaces, createWorkspace, updateWorkspace, deleteWorkspace,
  getFolders, createFolder, updateFolder, deleteFolder,
  getDocuments, getDocument, createDocument, updateDocument, deleteDocument,
  saveVersion, getVersions, restoreVersion,
  getTags, createTag, setDocumentTags,
  getComments, addComment, resolveComment,
  searchDocuments,
  getSettings, updateSettings,
  getCollaborators, addCollaborator, removeCollaborator,
  getTemplates, createTemplate, updateTemplate, deleteTemplate,
  uploadAttachment,
  getGraphData, getEntityDocuments,
  getBacklinks, syncLinks, searchByTitle
};
