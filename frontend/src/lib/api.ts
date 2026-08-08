const getApiBase = () => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  return 'http://localhost:3002/api';
};

const API_BASE = getApiBase();

function getAuthHeaders(): Record<string, string> {
  const raw = localStorage.getItem('svaramind_local_session');
  if (raw) {
    try {
      const session = JSON.parse(raw);
      if (session?.access_token) return { Authorization: `Bearer ${session.access_token}` };
    } catch { /* fall through */ }
  }
  return {};
}

async function apiCall<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const isFormData = options.body instanceof FormData;
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(!isFormData && { 'Content-Type': 'application/json' }),
      ...getAuthHeaders(),
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error || `API error ${response.status}`);
  }
  return response.json();
}

// ── Workspaces ────────────────────────────────────────────────────────────────
export const workspaceApi = {
  list: () => apiCall('/notes/workspaces'),
  create: (data: any) => apiCall('/notes/workspaces', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => apiCall(`/notes/workspaces/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => apiCall(`/notes/workspaces/${id}`, { method: 'DELETE' })
};

// ── Folders ────────────────────────────────────────────────────────────────
export const folderApi = {
  list: (workspaceId: string) => apiCall(`/notes/workspaces/${workspaceId}/folders`),
  create: (data: any) => apiCall('/notes/folders', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => apiCall(`/notes/folders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => apiCall(`/notes/folders/${id}`, { method: 'DELETE' })
};

// ── Documents ────────────────────────────────────────────────────────────────
export const documentApi = {
  list: (workspaceId: string, params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiCall(`/notes/workspaces/${workspaceId}/documents${qs ? '?' + qs : ''}`);
  },
  get: (id: string) => apiCall(`/notes/documents/${id}`),
  create: (data: any) => apiCall('/notes/documents', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => apiCall(`/notes/documents/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => apiCall(`/notes/documents/${id}`, { method: 'DELETE' }),
  getVersions: (id: string) => apiCall(`/notes/documents/${id}/versions`),
  saveVersion: (id: string, data: any) => apiCall(`/notes/documents/${id}/versions`, { method: 'POST', body: JSON.stringify(data) }),
  restoreVersion: (id: string, versionId: string) => apiCall(`/notes/documents/${id}/versions/${versionId}/restore`, { method: 'POST' }),
  import: (file: File, workspaceId: string, folderId?: string) => {
    const form = new FormData();
    form.append('file', file);
    form.append('workspace_id', workspaceId);
    if (folderId) form.append('folder_id', folderId);
    return apiCall('/notes/documents/import', { method: 'POST', body: form });
  }
};

// ── Tags ────────────────────────────────────────────────────────────────
export const tagApi = {
  list: (workspaceId: string) => apiCall(`/notes/workspaces/${workspaceId}/tags`),
  create: (data: any) => apiCall('/notes/tags', { method: 'POST', body: JSON.stringify(data) }),
  setDocumentTags: (documentId: string, tag_ids: string[]) =>
    apiCall(`/notes/documents/${documentId}/tags`, { method: 'PUT', body: JSON.stringify({ tag_ids }) })
};

// ── Comments ────────────────────────────────────────────────────────────────
export const commentApi = {
  list: (documentId: string) => apiCall(`/notes/documents/${documentId}/comments`),
  add: (documentId: string, data: any) => apiCall(`/notes/documents/${documentId}/comments`, { method: 'POST', body: JSON.stringify(data) }),
  resolve: (commentId: string) => apiCall(`/notes/comments/${commentId}/resolve`, { method: 'PUT' })
};

// ── Search ────────────────────────────────────────────────────────────────
export const searchApi = {
  search: (params: { q: string; workspace_id: string; limit?: number }) => {
    const qs = new URLSearchParams(params as any).toString();
    return apiCall(`/notes/search?${qs}`);
  }
};

// ── Settings ────────────────────────────────────────────────────────────────
export const settingsApi = {
  get: () => apiCall('/notes/settings'),
  update: (data: any) => apiCall('/notes/settings', { method: 'PUT', body: JSON.stringify(data) })
};

// ── Sharing ────────────────────────────────────────────────────────────────
export const shareApi = {
  getCollaborators: (documentId: string) => apiCall(`/notes/documents/${documentId}/collaborators`),
  addCollaborator: (documentId: string, data: any) => apiCall(`/notes/documents/${documentId}/collaborators`, { method: 'POST', body: JSON.stringify(data) }),
  removeCollaborator: (documentId: string, collaboratorId: string) => apiCall(`/notes/documents/${documentId}/collaborators/${collaboratorId}`, { method: 'DELETE' })
};

// ── Templates ────────────────────────────────────────────────────────────────
export const templateApi = {
  list: (workspace_id?: string) => apiCall(`/notes/templates${workspace_id ? `?workspace_id=${workspace_id}` : ''}`),
  create: (data: any) => apiCall('/notes/templates', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => apiCall(`/notes/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => apiCall(`/notes/templates/${id}`, { method: 'DELETE' })
};

// ── Graph ────────────────────────────────────────────────────────────────
export const graphApi = {
  get: (workspaceId: string) => apiCall(`/notes/workspaces/${workspaceId}/graph`),
  getEntityDocuments: (workspaceId: string, entityId: string) =>
    apiCall(`/notes/workspaces/${workspaceId}/entities/${entityId}/documents`)
};

// ── AI ────────────────────────────────────────────────────────────────
export const aiApi = {
  summarize: (content: string, length = 'medium') => apiCall('/notes/ai/summarize', { method: 'POST', body: JSON.stringify({ content, length }) }),
  extractEntities: (content: string) => apiCall('/notes/ai/entities', { method: 'POST', body: JSON.stringify({ content }) }),
  extractActionItems: (content: string) => apiCall('/notes/ai/action-items', { method: 'POST', body: JSON.stringify({ content }) }),
  suggestTags: (title: string, content: string) => apiCall('/notes/ai/suggest-tags', { method: 'POST', body: JSON.stringify({ title, content }) }),
  generateFAQ: (content: string, title: string) => apiCall('/notes/ai/faq', { method: 'POST', body: JSON.stringify({ content, title }) }),
  generateSlides: (content: string, title: string) => apiCall('/notes/ai/slides', { method: 'POST', body: JSON.stringify({ content, title }) }),
  chat: (content: string, title: string, question: string, history: any[] = [], document_id?: string, diagram_xml?: string, workspace_id?: string, web_search?: boolean, llm_config_id?: string, knowledge_scope?: { mode: string; folder_ids?: string[]; workspace_ids?: string[] }) =>
    apiCall('/notes/ai/chat', { method: 'POST', body: JSON.stringify({ content, title, question, history, document_id, diagram_xml, workspace_id, web_search, llm_config_id, knowledge_scope }) }),
  generatePresentation: (content: string, title: string, style = 'modern', slides = 6, llm_config_id?: string) =>
    apiCall('/notes/ai/presentation', { method: 'POST', body: JSON.stringify({ content, title, style, slides, llm_config_id }) }),
  generateInstagram: (content: string, title: string, opts: { size?: string; theme?: string; slides?: number; brand?: string; llm_config_id?: string } = {}) =>
    apiCall('/notes/ai/instagram', { method: 'POST', body: JSON.stringify({ content, title, ...opts }) }),
  generateDiagram: (prompt: string, content: string, title: string, llm_config_id?: string) =>
    apiCall('/notes/ai/diagram', { method: 'POST', body: JSON.stringify({ prompt, content, title, llm_config_id }) }),
  webSearch: (q: string, num = 5) =>
    apiCall('/notes/ai/web-search', { method: 'POST', body: JSON.stringify({ q, num }) }),
  improve: (text: string, instruction: string) => apiCall('/notes/ai/improve', { method: 'POST', body: JSON.stringify({ text, instruction }) }),
  expand: (text: string, direction: string) => apiCall('/notes/ai/expand', { method: 'POST', body: JSON.stringify({ text, direction }) }),
  processInsights: (document_id: string) => apiCall('/notes/ai/process-insights', { method: 'POST', body: JSON.stringify({ document_id }) }),
  getInsights: (documentId: string) => apiCall(`/notes/ai/insights/${documentId}`),
  generate: (template_prompt: string, context: string) => apiCall('/notes/ai/generate', { method: 'POST', body: JSON.stringify({ template_prompt, context }) }),
  semanticSearch: (q: string, workspace_id: string, limit = 10) =>
    apiCall('/notes/ai/semantic-search', { method: 'POST', body: JSON.stringify({ q, workspace_id, limit }) }),
  reindexWorkspace: (workspace_id: string) =>
    apiCall('/notes/ai/reindex-workspace', { method: 'POST', body: JSON.stringify({ workspace_id }) }),
  testEmbedding: (document_id?: string) =>
    apiCall(`/notes/ai/test-embedding${document_id ? `?document_id=${document_id}` : ''}`),
  ragProgress: (workspace_id: string) =>
    apiCall(`/notes/ai/rag-progress?workspace_id=${workspace_id}`),
  encryptWorkspace: (workspace_id: string) =>
    apiCall('/notes/ai/encrypt-workspace', { method: 'POST', body: JSON.stringify({ workspace_id }) }),
  globalChat: (question: string, history: any[], workspace_id?: string, llm_config_id?: string) =>
    apiCall('/notes/ai/global-chat', { method: 'POST', body: JSON.stringify({ question, history, workspace_id, llm_config_id }) }),
  transcribe: (audioBlob: Blob) => {
    const form = new FormData();
    form.append('audio', audioBlob, 'recording.webm');
    return apiCall('/notes/ai/transcribe', { method: 'POST', body: form });
  },
  getDefaults: () => apiCall('/notes/ai/defaults')
};

// ── Backlinks & Vault links ────────────────────────────────────────────────
export const todoApi = {
  list:      (workspace_id: string) => apiCall(`/notes/todos?workspace_id=${workspace_id}`),
  create:    (data: any) => apiCall('/notes/todos', { method: 'POST', body: JSON.stringify(data) }),
  update:    (id: string, data: any) => apiCall(`/notes/todos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggle:    (id: string) => apiCall(`/notes/todos/${id}/toggle`, { method: 'POST' }),
  delete:    (id: string) => apiCall(`/notes/todos/${id}`, { method: 'DELETE' }),
  clearDone: (workspace_id: string) => apiCall('/notes/todos/clear-done', { method: 'POST', body: JSON.stringify({ workspace_id }) })
};

// ── Public Blog (no auth needed) ─────────────────────────────────────────────
export const blogApi = {
  getProfile: (username: string) => apiCall(`/notes/blog/${encodeURIComponent(username)}`),
  getPost: (username: string, slug: string) => apiCall(`/notes/blog/${encodeURIComponent(username)}/${encodeURIComponent(slug)}`)
};

// ── Admin ────────────────────────────────────────────────────────────────
export const adminApi = {
  getStorageSettings: () => apiCall('/admin/settings/storage'),
  updateStorageSettings: (data: any) => apiCall('/admin/settings/storage', { method: 'PATCH', body: JSON.stringify(data) }),

  getLLMSettings: () => apiCall('/admin/settings/llm'),
  updateLLMSettings: (data: any) => apiCall('/admin/settings/llm', { method: 'PATCH', body: JSON.stringify(data) }),
  testDefaultEmbedding: () => apiCall('/admin/settings/llm/test-embedding'),
  reindexAll: () => apiCall('/admin/settings/llm/reindex-all', { method: 'POST' }),
  reindexAllProgress: () => apiCall('/admin/settings/llm/reindex-progress'),

  listUsers: () => apiCall('/admin/users'),
  createUser: (data: any) => apiCall('/admin/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: string, data: any) => apiCall(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteUser: (id: string) => apiCall(`/admin/users/${id}`, { method: 'DELETE' })
};

export const linksApi = {
  getBacklinks: (documentId: string) => apiCall(`/notes/documents/${documentId}/backlinks`),
  syncLinks: (documentId: string, linked_doc_ids: string[]) =>
    apiCall(`/notes/documents/${documentId}/links`, { method: 'PUT', body: JSON.stringify({ linked_doc_ids }) }),
  searchByTitle: (q: string, workspace_id: string) =>
    apiCall(`/notes/search/title?q=${encodeURIComponent(q)}&workspace_id=${workspace_id}`)
};
