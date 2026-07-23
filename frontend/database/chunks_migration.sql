  -- ============================================================
  -- Yesvara Notes — RAG Chunks & Backlinks Migration
  -- Run this after the main migration.sql
  -- ============================================================

  -- Document chunks for RAG
  -- Embeddings stored as JSONB float array (no pgvector required)
  CREATE TABLE IF NOT EXISTS notes_document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES notes_documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    embedding JSONB,  -- float[] as JSON array
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(document_id, chunk_index)
  );

  CREATE INDEX IF NOT EXISTS idx_notes_chunks_document ON notes_document_chunks(document_id);

  -- Document links (for backlinks / [[wikilink]] tracking)
  CREATE TABLE IF NOT EXISTS notes_document_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_document_id UUID NOT NULL REFERENCES notes_documents(id) ON DELETE CASCADE,
    target_document_id UUID NOT NULL REFERENCES notes_documents(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(source_document_id, target_document_id)
  );

  CREATE INDEX IF NOT EXISTS idx_notes_links_source ON notes_document_links(source_document_id);
  CREATE INDEX IF NOT EXISTS idx_notes_links_target ON notes_document_links(target_document_id);

  -- Enable RLS
  ALTER TABLE notes_document_chunks ENABLE ROW LEVEL SECURITY;
  ALTER TABLE notes_document_links ENABLE ROW LEVEL SECURITY;

  -- Chunks: readable if document is accessible
  CREATE POLICY "notes_chunks_select" ON notes_document_chunks
    FOR SELECT USING (
      document_id IN (
        SELECT id FROM notes_documents WHERE created_by = auth.uid()
      )
    );

  -- Links: same
  CREATE POLICY "notes_links_select" ON notes_document_links
    FOR SELECT USING (
      source_document_id IN (
        SELECT id FROM notes_documents WHERE created_by = auth.uid()
      )
    );
