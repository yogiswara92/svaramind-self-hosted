import { writable, derived, get } from 'svelte/store';
import { workspaceApi, folderApi, documentApi, tagApi } from '../lib/api';

// ── State ────────────────────────────────────────────────────────────────
export const workspaces = writable<any[]>([]);
export const currentWorkspace = writable<any>(null);
export const folders = writable<any[]>([]);
export const documents = writable<any[]>([]);
export const currentDocument = writable<any>(null);
export const tags = writable<any[]>([]);
export const loadingDocs = writable(false);
export const savingDoc = writable(false);
export const activeFolder = writable<string | null>(null);

export function clearNotesState() {
  workspaces.set([]);
  currentWorkspace.set(null);
  folders.set([]);
  documents.set([]);
  currentDocument.set(null);
  tags.set([]);
  activeFolder.set(null);
  localStorage.removeItem('notes_current_workspace');
}

// ── Workspaces ────────────────────────────────────────────────────────────────
export async function loadWorkspaces() {
  try {
    const { workspaces: data } = await workspaceApi.list();
    workspaces.set(data || []);

    // Set first workspace as current if none selected
    if (data?.length > 0) {
      const stored = localStorage.getItem('notes_current_workspace');
      const ws = stored ? data.find((w: any) => w.id === stored) : null;
      currentWorkspace.set(ws || data[0]);
    }
    return data;
  } catch (err) {
    console.error('[Notes] loadWorkspaces error:', err);
    return [];
  }
}

export async function createWorkspace(name: string, icon = '📚', color = '#6c63ff') {
  const { workspace } = await workspaceApi.create({ name, icon, color });
  workspaces.update(ws => [...ws, workspace]);
  return workspace;
}

export function selectWorkspace(ws: any) {
  currentWorkspace.set(ws);
  localStorage.setItem('notes_current_workspace', ws.id);
  activeFolder.set(null);
  loadFolders(ws.id);
  loadDocuments(ws.id);
  loadTags(ws.id);
}

// ── Folders ────────────────────────────────────────────────────────────────
export async function loadFolders(workspaceId: string) {
  try {
    const { folders: data } = await folderApi.list(workspaceId);
    folders.set(data || []);
  } catch (err) {
    console.error('[Notes] loadFolders error:', err);
  }
}

export async function createFolder(workspaceId: string, name: string, parentId?: string) {
  const { folder } = await folderApi.create({ workspace_id: workspaceId, parent_id: parentId, name });
  folders.update(fs => [...fs, folder]);
  return folder;
}

export async function deleteFolder(id: string) {
  await folderApi.delete(id);
  folders.update(fs => fs.filter(f => f.id !== id));
}

// ── Documents ────────────────────────────────────────────────────────────────
export async function loadDocuments(workspaceId: string, params: Record<string, string> = {}) {
  loadingDocs.set(true);
  try {
    const { documents: data } = await documentApi.list(workspaceId, params);
    documents.set(data || []);
  } catch (err) {
    console.error('[Notes] loadDocuments error:', err);
  } finally {
    loadingDocs.set(false);
  }
}

export async function createDocument(workspaceId: string, folderId?: string, template?: any) {
  const newDoc = {
    workspace_id: workspaceId,
    folder_id: folderId || null,
    title: 'Untitled',
    content: template?.content || { type: 'doc', content: [{ type: 'paragraph' }] },
    content_text: '',
    content_html: ''
  };

  const { document } = await documentApi.create(newDoc);
  documents.update(ds => [document, ...ds]);
  currentDocument.set(document);
  return document;
}

export async function saveDocument(id: string, updates: any) {
  savingDoc.set(true);
  try {
    const current = get(currentDocument);
    if (!current) throw new Error('No document loaded');

    // SAFETY CHECK: Never save document with empty content_text (prevents data loss from bulk auto-saves)
    if (updates.content_text !== undefined && updates.content_text.trim() === '') {
      console.warn(`[Notes] Blocked saving document ${id} with empty content_text to prevent data loss`);
      return current;
    }

    // Extract images and upload to storage before saving
    if (updates.content) {
      try {
        const { extractAndUploadImages } = await import('../lib/imageStorage');
        updates.content = await extractAndUploadImages(updates.content, id, current.workspace_id);
      } catch (err) {
        console.warn('Image upload skipped, saving with base64:', err);
      }
    }

    const apiResponse = await documentApi.update(id, updates);
    const updated = apiResponse.document;

    // If update is partial (e.g., only folder_id or is_pinned), fetch full document
    // to avoid losing content_text and other fields
    const fullDocument = (!updates.content && !updates.content_text)
      ? (await documentApi.get(id)).document
      : updated;

    documents.update(ds => ds.map(d => d.id === id ? { ...d, ...fullDocument } : d));
    currentDocument.update(d => d?.id === id ? { ...d, ...fullDocument } : d);
    return { ...fullDocument, _rag: apiResponse.rag ?? null };
  } finally {
    savingDoc.set(false);
  }
}

export async function deleteDocument(id: string) {
  try {
    let doc = get(documents).find(d => d.id === id);

    // If document not in store, try to load it first
    if (!doc) {
      try {
        doc = await loadDocument(id);
      } catch {
        console.warn('[Notes] Could not load document for cleanup:', id);
      }
    }

    if (doc?.workspace_id) {
      const { deleteDocumentImages } = await import('../lib/imageStorage');
      console.log('[Notes] Cleaning up images for document:', id);
      await deleteDocumentImages(doc.workspace_id, id);
    }
  } catch (err) {
    console.error('[Notes] Failed to cleanup images:', err);
  }

  await documentApi.delete(id);
  documents.update(ds => ds.filter(d => d.id !== id));
  currentDocument.update(d => d?.id === id ? null : d);
}

export async function loadDocument(id: string) {
  const { document } = await documentApi.get(id);
  currentDocument.set(document);
  return document;
}

// ── Tags ────────────────────────────────────────────────────────────────
export async function loadTags(workspaceId: string) {
  try {
    const { tags: data } = await tagApi.list(workspaceId);
    tags.set(data || []);
  } catch (err) {
    console.error('[Notes] loadTags error:', err);
  }
}

// ── Derived ────────────────────────────────────────────────────────────────
export const pinnedDocuments = derived(documents, $docs => $docs.filter(d => d.is_pinned));
export const recentDocuments = derived(documents, $docs =>
  [...$docs].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 10)
);
export const folderTree = derived(folders, $folders => {
  const roots = $folders.filter(f => !f.parent_id);
  const buildTree = (parent: any) => ({
    ...parent,
    children: $folders.filter(f => f.parent_id === parent.id).map(buildTree)
  });
  return roots.map(buildTree);
});
