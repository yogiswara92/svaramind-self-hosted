-- ============================================================
-- Yesvara Notes - Database Migration
-- All tables prefixed with "notes_"
-- ============================================================

-- WORKSPACES: Top-level namespace per user/team
CREATE TABLE IF NOT EXISTS notes_workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  icon VARCHAR(100) DEFAULT '📚',
  color VARCHAR(7) DEFAULT '#6c63ff',
  settings JSONB DEFAULT '{}',
  is_personal BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- FOLDERS: Hierarchical folder structure
CREATE TABLE IF NOT EXISTS notes_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES notes_workspaces(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES notes_folders(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  icon VARCHAR(100) DEFAULT '📁',
  color VARCHAR(7),
  sort_order INTEGER DEFAULT 0,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- DOCUMENTS: The actual notes
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
  created_by UUID NOT NULL REFERENCES auth.users(id),
  last_edited_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(public_slug)
);

-- TAGS
CREATE TABLE IF NOT EXISTS notes_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES notes_workspaces(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(7) DEFAULT '#6c757d',
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, name)
);

-- DOCUMENT TAGS (M2M)
CREATE TABLE IF NOT EXISTS notes_document_tags (
  document_id UUID NOT NULL REFERENCES notes_documents(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES notes_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (document_id, tag_id)
);

-- VERSION HISTORY
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
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- COLLABORATORS / SHARING PERMISSIONS
CREATE TABLE IF NOT EXISTS notes_document_collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES notes_documents(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES notes_workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255),
  role VARCHAR(20) NOT NULL DEFAULT 'viewer', -- viewer | commenter | editor | owner
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  UNIQUE(document_id, user_id)
);

-- COMMENTS (threaded)
CREATE TABLE IF NOT EXISTS notes_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES notes_documents(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES notes_comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  anchor_text TEXT,
  anchor_from INTEGER,
  anchor_to INTEGER,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_resolved BOOLEAN DEFAULT FALSE,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ
);

-- AI INSIGHTS (auto-generated metadata)
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

-- ATTACHMENTS (images, files)
CREATE TABLE IF NOT EXISTS notes_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES notes_documents(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES notes_workspaces(id) ON DELETE CASCADE,
  file_name VARCHAR(500) NOT NULL,
  file_type VARCHAR(100),
  file_size INTEGER,
  storage_path TEXT NOT NULL,
  public_url TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PER-USER SETTINGS
CREATE TABLE IF NOT EXISTS notes_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
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

-- TEMPLATES
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
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- WORKSPACE MEMBERS (for team workspaces)
CREATE TABLE IF NOT EXISTS notes_workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES notes_workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'member', -- owner | admin | member | viewer
  invited_by UUID REFERENCES auth.users(id),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, user_id)
);

-- ============================================================
-- INDEXES
-- ============================================================
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

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE notes_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes_document_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes_document_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes_ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes_workspace_members ENABLE ROW LEVEL SECURITY;

-- Workspaces: owner or member can access
CREATE POLICY "notes_workspaces_select" ON notes_workspaces
  FOR SELECT USING (
    owner_id = auth.uid() OR
    id IN (SELECT workspace_id FROM notes_workspace_members WHERE user_id = auth.uid())
  );
CREATE POLICY "notes_workspaces_insert" ON notes_workspaces
  FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "notes_workspaces_update" ON notes_workspaces
  FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "notes_workspaces_delete" ON notes_workspaces
  FOR DELETE USING (owner_id = auth.uid());

-- Documents: creator or collaborator
CREATE POLICY "notes_documents_select" ON notes_documents
  FOR SELECT USING (
    is_public = TRUE OR
    created_by = auth.uid() OR
    workspace_id IN (SELECT workspace_id FROM notes_workspace_members WHERE user_id = auth.uid()) OR
    id IN (SELECT document_id FROM notes_document_collaborators WHERE user_id = auth.uid())
  );
CREATE POLICY "notes_documents_insert" ON notes_documents
  FOR INSERT WITH CHECK (created_by = auth.uid());
CREATE POLICY "notes_documents_update" ON notes_documents
  FOR UPDATE USING (
    created_by = auth.uid() OR
    id IN (SELECT document_id FROM notes_document_collaborators WHERE user_id = auth.uid() AND role IN ('editor','owner'))
  );
CREATE POLICY "notes_documents_delete" ON notes_documents
  FOR DELETE USING (created_by = auth.uid());

-- Settings: own only
CREATE POLICY "notes_settings_own" ON notes_settings
  FOR ALL USING (user_id = auth.uid());

-- Templates: own or public
CREATE POLICY "notes_templates_select" ON notes_templates
  FOR SELECT USING (is_public = TRUE OR created_by = auth.uid());
CREATE POLICY "notes_templates_insert" ON notes_templates
  FOR INSERT WITH CHECK (created_by = auth.uid());
CREATE POLICY "notes_templates_update" ON notes_templates
  FOR UPDATE USING (created_by = auth.uid());
CREATE POLICY "notes_templates_delete" ON notes_templates
  FOR DELETE USING (created_by = auth.uid());

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION notes_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notes_workspaces_updated_at
  BEFORE UPDATE ON notes_workspaces
  FOR EACH ROW EXECUTE FUNCTION notes_update_updated_at();

CREATE TRIGGER notes_documents_updated_at
  BEFORE UPDATE ON notes_documents
  FOR EACH ROW EXECUTE FUNCTION notes_update_updated_at();

CREATE TRIGGER notes_folders_updated_at
  BEFORE UPDATE ON notes_folders
  FOR EACH ROW EXECUTE FUNCTION notes_update_updated_at();

CREATE TRIGGER notes_settings_updated_at
  BEFORE UPDATE ON notes_settings
  FOR EACH ROW EXECUTE FUNCTION notes_update_updated_at();

-- Full-text search function
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
