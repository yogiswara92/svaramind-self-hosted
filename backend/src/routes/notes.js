const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
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
} = require('../controllers/notesController');

const { upload, importDocument } = require('../controllers/notesImportController');
const { getTodos, createTodo, updateTodo, toggleTodo, deleteTodo, clearDone } = require('../controllers/notesTodosController');
const { upload: uploadAudio, transcribe } = require('../controllers/notesTranscribeController');
const { globalChat } = require('../controllers/notesGlobalChatController');

const {
  summarize, extractEntities, extractActionItems, suggestTags,
  generateFAQ, generateSlides, chat, improveWriting, expandText,
  processInsights, getInsights, generateFromTemplate, semanticSearchHandler,
  reindexWorkspace, webSearch, encryptWorkspace, testEmbedding, ragProgress,
  generatePresentationHandler, generateInstagramHandler, generateDiagramHandler,
  getAIDefaults
} = require('../controllers/notesAIController');

// ── Public blog routes (no auth required) ────────────────────────────────────
router.get('/blog/:username', getBlogProfile);
router.get('/blog/:username/:slug', getBlogPost);

// All routes below require auth
router.use(authenticateToken);

// ── Workspaces
router.get('/workspaces', getWorkspaces);
router.post('/workspaces', createWorkspace);
router.put('/workspaces/:id', updateWorkspace);
router.delete('/workspaces/:id', deleteWorkspace);

// ── Folders
router.get('/workspaces/:workspaceId/folders', getFolders);
router.post('/folders', createFolder);
router.put('/folders/:id', updateFolder);
router.delete('/folders/:id', deleteFolder);

// ── Documents
router.get('/workspaces/:workspaceId/documents', getDocuments);
router.get('/documents/:id', getDocument);
router.post('/documents', createDocument);
router.put('/documents/:id', updateDocument);
router.delete('/documents/:id', deleteDocument);

// ── Versions
router.get('/documents/:id/versions', getVersions);
router.post('/documents/:id/versions', saveVersion);
router.post('/documents/:id/versions/:versionId/restore', restoreVersion);

// ── Tags
router.get('/workspaces/:workspaceId/tags', getTags);
router.post('/tags', createTag);
router.put('/documents/:id/tags', setDocumentTags);

// ── Comments
router.get('/documents/:id/comments', getComments);
router.post('/documents/:id/comments', addComment);
router.put('/comments/:commentId/resolve', resolveComment);

// ── Search
router.get('/search', searchDocuments);

// ── Settings
router.get('/settings', getSettings);
router.put('/settings', updateSettings);

// ── Sharing / Collaborators
router.get('/documents/:id/collaborators', getCollaborators);
router.post('/documents/:id/collaborators', addCollaborator);
router.delete('/documents/:id/collaborators/:collaboratorId', removeCollaborator);

// ── Templates
router.get('/templates', getTemplates);
router.post('/templates', createTemplate);
router.put('/templates/:id', updateTemplate);
router.delete('/templates/:id', deleteTemplate);

// ── Import
router.post('/documents/import', upload.single('file'), importDocument);

// ── Attachments
router.post('/documents/:id/attachments', uploadAttachment);

// ── Graph
router.get('/workspaces/:workspaceId/graph', getGraphData);
router.get('/workspaces/:workspaceId/entities/:entityId/documents', getEntityDocuments);

// ── Backlinks & wikilinks
router.get('/documents/:id/backlinks', getBacklinks);
router.put('/documents/:id/links', syncLinks);
router.get('/search/title', searchByTitle);

// ── AI Endpoints
router.post('/ai/summarize', summarize);
router.post('/ai/entities', extractEntities);
router.post('/ai/action-items', extractActionItems);
router.post('/ai/suggest-tags', suggestTags);
router.post('/ai/faq', generateFAQ);
router.post('/ai/slides', generateSlides);
router.post('/ai/presentation', generatePresentationHandler);
router.post('/ai/instagram', generateInstagramHandler);
router.post('/ai/diagram', generateDiagramHandler);
router.post('/ai/chat', chat);
router.post('/ai/improve', improveWriting);
router.post('/ai/expand', expandText);
router.post('/ai/process-insights', processInsights);
router.get('/ai/insights/:document_id', getInsights);
router.post('/ai/generate', generateFromTemplate);
router.post('/ai/semantic-search', semanticSearchHandler);
router.post('/ai/reindex-workspace', reindexWorkspace);
router.post('/ai/web-search', webSearch);
router.post('/ai/encrypt-workspace', encryptWorkspace);
router.post('/ai/global-chat', globalChat);
router.get('/ai/test-embedding', testEmbedding);
router.get('/ai/rag-progress', ragProgress);
router.get('/ai/defaults', getAIDefaults);

// ── Todos
router.get('/todos', getTodos);
router.post('/todos', createTodo);
router.put('/todos/:id', updateTodo);
router.post('/todos/:id/toggle', toggleTodo);
router.delete('/todos/:id', deleteTodo);
router.post('/todos/clear-done', clearDone);
router.post('/ai/transcribe', uploadAudio.single('audio'), transcribe);

module.exports = router;
