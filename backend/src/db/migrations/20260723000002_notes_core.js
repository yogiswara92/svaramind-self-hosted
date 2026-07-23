// Ported from notes/database/migration.sql + notes_todos (svarabase/migrations/20260601_svarabase_reconcile.sql).
// Changes vs the original: all `auth.users(id)` FKs point at the local `users` table,
// and RLS/CREATE POLICY blocks are dropped entirely (they relied on Svarabase's
// SET LOCAL request.jwt.claims session injection, which no longer exists here -
// authorization is enforced in the application layer instead, see backend/src/controllers).

exports.up = async function (knex) {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS notes_workspaces (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      description TEXT,
      owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      icon VARCHAR(100) DEFAULT '📚',
      color VARCHAR(7) DEFAULT '#6c63ff',
      settings JSONB DEFAULT '{}',
      is_personal BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS notes_folders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES notes_workspaces(id) ON DELETE CASCADE,
      parent_id UUID REFERENCES notes_folders(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      icon VARCHAR(100) DEFAULT '📁',
      color VARCHAR(7),
      sort_order INTEGER DEFAULT 0,
      created_by UUID NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS notes_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES notes_workspaces(id) ON DELETE CASCADE,
      folder_id UUID REFERENCES notes_folders(id) ON DELETE SET NULL,
      title VARCHAR(500) NOT NULL DEFAULT 'Untitled',
      content JSONB DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}',
      content_text TEXT DEFAULT '',
      content_html TEXT DEFAULT '',
      cover_image TEXT,
      icon VARCHAR(100) DEFAULT '📄',
      is_pinned BOOLEAN DEFAULT FALSE,
      is_archived BOOLEAN DEFAULT FALSE,
      is_template BOOLEAN DEFAULT FALSE,
      is_public BOOLEAN DEFAULT FALSE,
      public_slug VARCHAR(200),
      word_count INTEGER DEFAULT 0,
      read_time_minutes INTEGER DEFAULT 0,
      views INTEGER DEFAULT 0,
      created_by UUID NOT NULL REFERENCES users(id),
      last_edited_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(public_slug)
    );

    CREATE TABLE IF NOT EXISTS notes_tags (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES notes_workspaces(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      color VARCHAR(7) DEFAULT '#6c757d',
      created_by UUID NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(workspace_id, name)
    );

    CREATE TABLE IF NOT EXISTS notes_document_tags (
      document_id UUID NOT NULL REFERENCES notes_documents(id) ON DELETE CASCADE,
      tag_id UUID NOT NULL REFERENCES notes_tags(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (document_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS notes_document_versions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id UUID NOT NULL REFERENCES notes_documents(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      title VARCHAR(500),
      content JSONB,
      content_text TEXT,
      content_html TEXT,
      word_count INTEGER DEFAULT 0,
      change_summary TEXT,
      created_by UUID NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS notes_document_collaborators (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id UUID REFERENCES notes_documents(id) ON DELETE CASCADE,
      workspace_id UUID REFERENCES notes_workspaces(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email VARCHAR(255),
      role VARCHAR(20) NOT NULL DEFAULT 'viewer',
      invited_by UUID REFERENCES users(id),
      invited_at TIMESTAMPTZ DEFAULT NOW(),
      accepted_at TIMESTAMPTZ,
      UNIQUE(document_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS notes_comments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id UUID NOT NULL REFERENCES notes_documents(id) ON DELETE CASCADE,
      parent_id UUID REFERENCES notes_comments(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      anchor_text TEXT,
      anchor_from INTEGER,
      anchor_to INTEGER,
      created_by UUID NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      is_resolved BOOLEAN DEFAULT FALSE,
      resolved_by UUID REFERENCES users(id),
      resolved_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS notes_ai_insights (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id UUID NOT NULL REFERENCES notes_documents(id) ON DELETE CASCADE UNIQUE,
      summary TEXT,
      key_entities JSONB DEFAULT '[]',
      auto_tags JSONB DEFAULT '[]',
      action_items JSONB DEFAULT '[]',
      key_points JSONB DEFAULT '[]',
      sentiment VARCHAR(20),
      topics JSONB DEFAULT '[]',
      questions JSONB DEFAULT '[]',
      related_doc_ids JSONB DEFAULT '[]',
      processing_status VARCHAR(20) DEFAULT 'pending',
      last_processed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS notes_attachments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id UUID NOT NULL REFERENCES notes_documents(id) ON DELETE CASCADE,
      workspace_id UUID NOT NULL REFERENCES notes_workspaces(id) ON DELETE CASCADE,
      file_name VARCHAR(500) NOT NULL,
      file_type VARCHAR(100),
      file_size INTEGER,
      storage_path TEXT NOT NULL,
      public_url TEXT,
      created_by UUID NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS notes_settings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
      theme VARCHAR(20) DEFAULT 'light',
      editor_font VARCHAR(100) DEFAULT 'Inter',
      editor_font_size INTEGER DEFAULT 16,
      editor_line_height FLOAT DEFAULT 1.6,
      default_workspace_id UUID REFERENCES notes_workspaces(id),
      ai_enabled BOOLEAN DEFAULT TRUE,
      ai_auto_tag BOOLEAN DEFAULT TRUE,
      ai_auto_summary BOOLEAN DEFAULT TRUE,
      ai_model VARCHAR(200) DEFAULT 'mistralai/mistral-small-3.2-24b-instruct',
      ai_provider VARCHAR(50) DEFAULT 'openrouter',
      ai_api_key TEXT,
      ai_base_url TEXT DEFAULT 'https://openrouter.ai/api/v1',
      ai_default_language VARCHAR(50) DEFAULT 'auto',
      apilogy_api_key TEXT,
      llm_configs JSONB DEFAULT '[]',
      default_llm_config UUID,
      embedding_provider VARCHAR(50) DEFAULT 'openrouter',
      transcription_provider VARCHAR(50) DEFAULT 'openrouter',
      sidebar_collapsed BOOLEAN DEFAULT FALSE,
      show_word_count BOOLEAN DEFAULT TRUE,
      spell_check BOOLEAN DEFAULT TRUE,
      auto_save BOOLEAN DEFAULT TRUE,
      auto_save_interval_seconds INTEGER DEFAULT 3,
      show_ai_panel BOOLEAN DEFAULT TRUE,
      compact_mode BOOLEAN DEFAULT FALSE,
      show_breadcrumbs BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS notes_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID REFERENCES notes_workspaces(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      content JSONB DEFAULT '{}',
      content_html TEXT,
      icon VARCHAR(100) DEFAULT '📋',
      category VARCHAR(100) DEFAULT 'General',
      is_public BOOLEAN DEFAULT FALSE,
      use_count INTEGER DEFAULT 0,
      created_by UUID NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS notes_workspace_members (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES notes_workspaces(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role VARCHAR(20) NOT NULL DEFAULT 'member',
      invited_by UUID REFERENCES users(id),
      joined_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(workspace_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS notes_todos (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES notes_workspaces(id) ON DELETE CASCADE,
      created_by   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title        TEXT NOT NULL,
      description  TEXT DEFAULT '',
      is_done      BOOLEAN DEFAULT FALSE,
      priority     TEXT DEFAULT 'normal',
      due_date     DATE,
      done_at      TIMESTAMPTZ,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_notes_documents_workspace ON notes_documents(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_notes_documents_folder ON notes_documents(folder_id);
    CREATE INDEX IF NOT EXISTS idx_notes_documents_created_by ON notes_documents(created_by);
    CREATE INDEX IF NOT EXISTS idx_notes_documents_updated ON notes_documents(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notes_documents_pinned ON notes_documents(workspace_id, is_pinned) WHERE is_pinned = TRUE;
    CREATE INDEX IF NOT EXISTS idx_notes_documents_archived ON notes_documents(workspace_id, is_archived);
    CREATE INDEX IF NOT EXISTS idx_notes_documents_fts ON notes_documents
      USING gin(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content_text, '')));

    CREATE INDEX IF NOT EXISTS idx_notes_folders_workspace ON notes_folders(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_notes_folders_parent ON notes_folders(parent_id);
    CREATE INDEX IF NOT EXISTS idx_notes_tags_workspace ON notes_tags(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_notes_versions_document ON notes_document_versions(document_id, version_number DESC);
    CREATE INDEX IF NOT EXISTS idx_notes_comments_document ON notes_comments(document_id);
    CREATE INDEX IF NOT EXISTS idx_notes_collaborators_user ON notes_document_collaborators(user_id);
    CREATE INDEX IF NOT EXISTS idx_notes_insights_document ON notes_ai_insights(document_id);
    CREATE INDEX IF NOT EXISTS idx_notes_attachments_document ON notes_attachments(document_id);
    CREATE INDEX IF NOT EXISTS idx_notes_workspace_members ON notes_workspace_members(workspace_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_notes_todos_workspace ON notes_todos(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_notes_todos_created_by ON notes_todos(created_by);

    CREATE OR REPLACE FUNCTION notes_update_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS notes_workspaces_updated_at ON notes_workspaces;
    CREATE TRIGGER notes_workspaces_updated_at
      BEFORE UPDATE ON notes_workspaces
      FOR EACH ROW EXECUTE FUNCTION notes_update_updated_at();

    DROP TRIGGER IF EXISTS notes_documents_updated_at ON notes_documents;
    CREATE TRIGGER notes_documents_updated_at
      BEFORE UPDATE ON notes_documents
      FOR EACH ROW EXECUTE FUNCTION notes_update_updated_at();

    DROP TRIGGER IF EXISTS notes_folders_updated_at ON notes_folders;
    CREATE TRIGGER notes_folders_updated_at
      BEFORE UPDATE ON notes_folders
      FOR EACH ROW EXECUTE FUNCTION notes_update_updated_at();

    DROP TRIGGER IF EXISTS notes_settings_updated_at ON notes_settings;
    CREATE TRIGGER notes_settings_updated_at
      BEFORE UPDATE ON notes_settings
      FOR EACH ROW EXECUTE FUNCTION notes_update_updated_at();

    DROP TRIGGER IF EXISTS notes_todos_updated_at ON notes_todos;
    CREATE TRIGGER notes_todos_updated_at
      BEFORE UPDATE ON notes_todos
      FOR EACH ROW EXECUTE FUNCTION notes_update_updated_at();

    CREATE OR REPLACE FUNCTION notes_search_documents(
      p_user_id UUID,
      p_workspace_id UUID,
      p_query TEXT,
      p_limit INTEGER DEFAULT 20
    )
    RETURNS TABLE(
      id UUID, title VARCHAR, content_text TEXT, icon VARCHAR,
      folder_id UUID, updated_at TIMESTAMPTZ, rank REAL
    ) AS $$
    BEGIN
      RETURN QUERY
      SELECT
        d.id, d.title, d.content_text, d.icon,
        d.folder_id, d.updated_at,
        ts_rank(
          to_tsvector('english', coalesce(d.title,'') || ' ' || coalesce(d.content_text,'')),
          plainto_tsquery('english', p_query)
        ) AS rank
      FROM notes_documents d
      WHERE
        d.workspace_id = p_workspace_id AND
        d.is_archived = FALSE AND
        d.created_by = p_user_id AND
        to_tsvector('english', coalesce(d.title,'') || ' ' || coalesce(d.content_text,''))
          @@ plainto_tsquery('english', p_query)
      ORDER BY rank DESC
      LIMIT p_limit;
    END;
    $$ LANGUAGE plpgsql;
  `);
};

exports.down = async function (knex) {
  await knex.raw(`
    DROP FUNCTION IF EXISTS notes_search_documents(UUID, UUID, TEXT, INTEGER);
    DROP FUNCTION IF EXISTS notes_update_updated_at() CASCADE;
    DROP TABLE IF EXISTS notes_todos;
    DROP TABLE IF EXISTS notes_workspace_members;
    DROP TABLE IF EXISTS notes_templates;
    DROP TABLE IF EXISTS notes_settings;
    DROP TABLE IF EXISTS notes_attachments;
    DROP TABLE IF EXISTS notes_ai_insights;
    DROP TABLE IF EXISTS notes_comments;
    DROP TABLE IF EXISTS notes_document_collaborators;
    DROP TABLE IF EXISTS notes_document_versions;
    DROP TABLE IF EXISTS notes_document_tags;
    DROP TABLE IF EXISTS notes_tags;
    DROP TABLE IF EXISTS notes_documents;
    DROP TABLE IF EXISTS notes_folders;
    DROP TABLE IF EXISTS notes_workspaces;
  `);
};
