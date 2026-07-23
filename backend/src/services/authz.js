const { db } = require('../config/db');

// Thrown by the assert* helpers below; controllers catch it once and map
// status -> res.status(status).json({error: message}) instead of repeating
// ownership checks ad-hoc (see the missing-ownership-check audit from the
// closed-loop migration plan - this is the fix for that gap).
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function getWorkspaceRole(workspaceId, userId) {
  const ws = await db('notes_workspaces').where({ id: workspaceId }).first();
  if (!ws) return null;
  if (ws.owner_id === userId) return 'owner';
  const member = await db('notes_workspace_members').where({ workspace_id: workspaceId, user_id: userId }).first();
  return member ? member.role : null;
}

async function assertWorkspaceAccess(workspaceId, userId) {
  const role = await getWorkspaceRole(workspaceId, userId);
  if (!role) throw new HttpError(403, 'Not authorized for this workspace');
  return role;
}

async function assertWorkspaceOwner(workspaceId, userId) {
  const ws = await db('notes_workspaces').where({ id: workspaceId }).first();
  if (!ws) throw new HttpError(404, 'Workspace not found');
  if (ws.owner_id !== userId) throw new HttpError(403, 'Only the workspace owner can perform this action');
  return ws;
}

async function getDocumentCollaboratorRole(documentId, userId) {
  const row = await db('notes_document_collaborators').where({ document_id: documentId, user_id: userId }).first();
  return row ? row.role : null;
}

// Returns the document row if the user may read/write it, otherwise throws 404/403.
async function assertDocumentAccess(documentId, userId, { write = false } = {}) {
  const doc = await db('notes_documents').where({ id: documentId }).first();
  if (!doc) throw new HttpError(404, 'Document not found');
  if (doc.created_by === userId) return doc;

  const collabRole = await getDocumentCollaboratorRole(documentId, userId);
  if (write) {
    if (collabRole === 'editor' || collabRole === 'owner') return doc;
  } else {
    if (collabRole) return doc;
    if (doc.is_public) return doc;
    const wsRole = await getWorkspaceRole(doc.workspace_id, userId);
    if (wsRole) return doc;
  }
  throw new HttpError(403, 'Not authorized for this document');
}

async function assertFolderAccess(folderId, userId) {
  const folder = await db('notes_folders').where({ id: folderId }).first();
  if (!folder) throw new HttpError(404, 'Folder not found');
  const role = await getWorkspaceRole(folder.workspace_id, userId);
  if (!role) throw new HttpError(403, 'Not authorized for this folder');
  return folder;
}

// Shared error-shaping so every controller reports HttpError consistently
// while unexpected errors still fall through as 500s like before.
function handleError(res, err, label) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(`[Notes] ${label} error:`, err);
  return res.status(500).json({ error: err.message });
}

module.exports = {
  HttpError,
  getWorkspaceRole,
  assertWorkspaceAccess,
  assertWorkspaceOwner,
  assertDocumentAccess,
  assertFolderAccess,
  getDocumentCollaboratorRole,
  handleError
};
