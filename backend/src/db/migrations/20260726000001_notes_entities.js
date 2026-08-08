// Knowledge-graph-as-RAG: entities extracted per document (already happening
// in notesAIService.extractEntities) are normalized into their own records
// and linked across documents, instead of being thrown away as a per-note
// JSON blob. notes_entity_relations adds a lightweight, best-effort version
// of temporal fact tracking (a new relation for the same subject+relation
// supersedes the old one) - not a full bi-temporal model, just enough to
// answer "what do we currently know" without contradicting itself.

exports.up = async function (knex) {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS notes_entities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES notes_workspaces(id) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL,
      name VARCHAR(300) NOT NULL,
      normalized_name VARCHAR(300) NOT NULL,
      mention_count INTEGER DEFAULT 0,
      first_mentioned_at TIMESTAMPTZ DEFAULT NOW(),
      last_mentioned_at TIMESTAMPTZ DEFAULT NOW(),
      created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(workspace_id, type, normalized_name)
    );

    CREATE INDEX IF NOT EXISTS idx_notes_entities_workspace ON notes_entities(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_notes_entities_lookup ON notes_entities(workspace_id, normalized_name);

    CREATE TABLE IF NOT EXISTS notes_document_entities (
      document_id UUID NOT NULL REFERENCES notes_documents(id) ON DELETE CASCADE,
      entity_id UUID NOT NULL REFERENCES notes_entities(id) ON DELETE CASCADE,
      mentioned_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (document_id, entity_id)
    );

    CREATE INDEX IF NOT EXISTS idx_notes_doc_entities_entity ON notes_document_entities(entity_id);
    CREATE INDEX IF NOT EXISTS idx_notes_doc_entities_document ON notes_document_entities(document_id);

    -- Lightweight subject-relation-object triples with provenance. A new row
    -- with the same (subject_entity_id, relation) invalidates the previous
    -- one(s) sharing that pair, rather than trying to detect contradictions
    -- semantically - a lot simpler than true bi-temporal fact tracking, but
    -- enough to keep "what's true now" queries from returning stale facts.
    CREATE TABLE IF NOT EXISTS notes_entity_relations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES notes_workspaces(id) ON DELETE CASCADE,
      subject_entity_id UUID NOT NULL REFERENCES notes_entities(id) ON DELETE CASCADE,
      relation VARCHAR(200) NOT NULL,
      object_entity_id UUID NOT NULL REFERENCES notes_entities(id) ON DELETE CASCADE,
      source_document_id UUID REFERENCES notes_documents(id) ON DELETE SET NULL,
      valid_at TIMESTAMPTZ DEFAULT NOW(),
      invalidated_at TIMESTAMPTZ,
      created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_notes_relations_workspace ON notes_entity_relations(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_notes_relations_subject_active ON notes_entity_relations(subject_entity_id) WHERE invalidated_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_notes_relations_object_active ON notes_entity_relations(object_entity_id) WHERE invalidated_at IS NULL;
  `);
};

exports.down = async function (knex) {
  await knex.raw(`
    DROP TABLE IF EXISTS notes_entity_relations;
    DROP TABLE IF EXISTS notes_document_entities;
    DROP TABLE IF EXISTS notes_entities;
  `);
};
