// Ported from notes/database/chunks_migration.sql. RLS/CREATE POLICY dropped
// (see 20260723000002_notes_core.js for rationale) - ownership is enforced by
// notes-be controllers instead.

exports.up = async function (knex) {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS notes_document_chunks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id UUID NOT NULL REFERENCES notes_documents(id) ON DELETE CASCADE,
      chunk_index INTEGER NOT NULL,
      chunk_text TEXT NOT NULL,
      embedding JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(document_id, chunk_index)
    );

    CREATE INDEX IF NOT EXISTS idx_notes_chunks_document ON notes_document_chunks(document_id);

    CREATE TABLE IF NOT EXISTS notes_document_links (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_document_id UUID NOT NULL REFERENCES notes_documents(id) ON DELETE CASCADE,
      target_document_id UUID NOT NULL REFERENCES notes_documents(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(source_document_id, target_document_id)
    );

    CREATE INDEX IF NOT EXISTS idx_notes_links_source ON notes_document_links(source_document_id);
    CREATE INDEX IF NOT EXISTS idx_notes_links_target ON notes_document_links(target_document_id);
  `);
};

exports.down = async function (knex) {
  await knex.raw(`
    DROP TABLE IF EXISTS notes_document_links;
    DROP TABLE IF EXISTS notes_document_chunks;
  `);
};
