const crypto = require('crypto');
const { db } = require('../config/db');
const notesEmbeddingService = require('../services/notesEmbeddingService');
const { decryptDocument, encryptDocument } = require('../services/encryptionService');
const { markdownToTiptap, markdownToHtml } = require('../services/markdownToTiptap');
const { getWorkspaceRole } = require('../services/authz');

// MCP tool content is written as markdown; convert to the TipTap JSON the
// editor actually reads (`content`) and an HTML fallback (`content_html`).
function textToTipTap(text) {
  return markdownToTiptap(text);
}

function textToHtml(text) {
  return markdownToHtml(text);
}

const WORKSPACE_ID_PROPERTY = {
  workspace_id: { type: 'string', description: 'Svaramind workspace UUID (see svaramind_list_workspaces)' },
};

const TOOL_CATALOG = [
  {
    name: 'svaramind_list_workspaces',
    description: 'List Svaramind workspaces available to the current user. Call this first if you do not already know which workspace_id to use.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'svaramind_list_folders',
    description: 'List folders inside a Svaramind workspace, optionally scoped to a parent folder (for nested browsing). Use this to see the workspace -> folder structure before writing or searching.',
    inputSchema: {
      type: 'object',
      properties: { ...WORKSPACE_ID_PROPERTY, parent_id: { type: 'string', description: 'Optional parent folder UUID to list subfolders of. Omit to list top-level folders.' } },
      required: ['workspace_id'],
    },
  },
  {
    name: 'svaramind_search',
    description: 'Search a Svaramind workspace for relevant knowledge. Use this to recall information previously stored about topics, people, tasks, or decisions.',
    inputSchema: {
      type: 'object',
      properties: { ...WORKSPACE_ID_PROPERTY, query: { type: 'string', description: 'What to search for' }, limit: { type: 'integer', description: 'Max results (default 5)', default: 5 } },
      required: ['workspace_id', 'query'],
    },
  },
  {
    name: 'svaramind_write',
    description: 'Save new knowledge, drafts, or notes to a Svaramind workspace. Use this when you learn something important, a user shares facts about themselves, key decisions are made, or the user asks you to draft/save a piece of writing.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_ID_PROPERTY,
        title: { type: 'string', description: 'Title for the note' },
        content: { type: 'string', description: 'Content to save (markdown supported)' },
        folder_id: { type: 'string', description: 'Optional folder UUID to file this note under (see svaramind_list_folders). Takes precedence over folder_name.' },
        folder_name: { type: 'string', description: 'Optional top-level folder name to organize notes. Created if it does not already exist. Ignored if folder_id is set.' },
      },
      required: ['workspace_id', 'title', 'content'],
    },
  },
  {
    name: 'svaramind_list_recent',
    description: 'List recently modified notes in a Svaramind workspace. Use this to see what knowledge is available before searching.',
    inputSchema: {
      type: 'object',
      properties: { ...WORKSPACE_ID_PROPERTY, folder_id: { type: 'string', description: 'Optional folder UUID to scope the listing to.' }, limit: { type: 'integer', description: 'Number of recent notes (default 10)', default: 10 } },
      required: ['workspace_id'],
    },
  },
  {
    name: 'svaramind_update',
    description: 'Update or append to an existing note in a Svaramind workspace. Use this to add information to an existing note rather than creating a duplicate.',
    inputSchema: {
      type: 'object',
      properties: { ...WORKSPACE_ID_PROPERTY, document_id: { type: 'string', description: 'ID of the document to update' }, content_append: { type: 'string', description: 'Text to append to the document' } },
      required: ['workspace_id', 'document_id', 'content_append'],
    },
  },
];

async function handleJsonRpc(req, res) {
  const { id, method, params } = req.body;
  const userId = req.mcpUserId;

  try {
    if (method === 'initialize') {
      res.set('Mcp-Session-Id', crypto.randomUUID());
      return res.json({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: (params && params.protocolVersion) || '2025-03-26',
          capabilities: { tools: {} },
          serverInfo: { name: 'svaramind-mcp', version: '1.0.0' },
        },
      });
    }

    if (method === 'notifications/initialized') {
      return res.status(200).end();
    }

    if (method === 'tools/list') {
      return res.json({ jsonrpc: '2.0', id, result: { tools: TOOL_CATALOG } });
    }

    if (method === 'tools/call') {
      const { name, arguments: args } = params;
      const workspaceId = args?.workspace_id;

      if (!workspaceId && name !== 'svaramind_list_workspaces') {
        return res.json({ jsonrpc: '2.0', id, error: { code: -32602, message: 'workspace_id required' } });
      }

      // Every tool that scopes to a workspace must first confirm the caller
      // actually has access to it (owner or member) - previously missing for
      // svaramind_list_folders (see closed-loop migration security audit).
      if (workspaceId) {
        const role = await getWorkspaceRole(workspaceId, userId);
        if (!role) {
          return res.json({ jsonrpc: '2.0', id, error: { code: -32603, message: 'Not authorized for this workspace' } });
        }
      }

      let result;
      try {
        switch (name) {
          case 'svaramind_list_workspaces':
            result = await handleListWorkspaces(userId);
            break;
          case 'svaramind_list_folders':
            result = await handleListFolders(args, workspaceId);
            break;
          case 'svaramind_search':
            result = await handleSearch(args, workspaceId, userId);
            break;
          case 'svaramind_write':
            result = await handleWrite(args, workspaceId, userId);
            break;
          case 'svaramind_list_recent':
            result = await handleListRecent(args, workspaceId, userId);
            break;
          case 'svaramind_update':
            result = await handleUpdate(args, workspaceId, userId);
            break;
          default:
            return res.json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Tool not found: ${name}` } });
        }
        return res.json({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] } });
      } catch (toolErr) {
        console.error('[MCP] Tool error:', toolErr.message);
        return res.json({ jsonrpc: '2.0', id, error: { code: -32603, message: toolErr.message } });
      }
    }

    return res.json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown method: ${method}` } });
  } catch (err) {
    console.error('[MCP] Request error:', err.message);
    return res.json({ jsonrpc: '2.0', id, error: { code: -32603, message: err.message } });
  }
}

async function handleListWorkspaces(userId) {
  try {
    const owned = await db('notes_workspaces')
      .where({ owner_id: userId })
      .select('id', 'name', 'description', 'icon', 'is_personal', 'updated_at');

    const memberRows = await db('notes_workspace_members as m')
      .join('notes_workspaces as w', 'w.id', 'm.workspace_id')
      .where('m.user_id', userId)
      .select('m.role', 'w.id', 'w.name', 'w.description', 'w.icon', 'w.is_personal', 'w.updated_at');

    const byId = new Map(owned.map(w => [w.id, { ...w, role: 'owner' }]));
    for (const row of memberRows) {
      if (!byId.has(row.id)) byId.set(row.id, { ...row, role: row.role || 'member' });
    }

    return { success: true, workspaces: Array.from(byId.values()) };
  } catch (e) {
    console.error('[handleListWorkspaces]', e.message);
    return { success: false, error: e.message };
  }
}

async function handleListFolders(args, workspaceId) {
  const { parent_id = null } = args || {};

  try {
    let q = db('notes_folders').where({ workspace_id: workspaceId }).select('id', 'name', 'parent_id', 'icon', 'sort_order', 'updated_at').orderBy('sort_order', 'asc');
    q = parent_id ? q.where({ parent_id }) : q.whereNull('parent_id');

    const folders = await q;
    return { success: true, folders };
  } catch (e) {
    console.error('[handleListFolders]', e.message);
    return { success: false, error: e.message };
  }
}

async function handleSearch(args, workspaceId, userId) {
  const { query, limit = 5 } = args;
  if (!query) throw new Error('query required');

  try {
    const results = await notesEmbeddingService.semanticSearch(query, workspaceId, userId, limit);
    return {
      success: true,
      results: results.map(r => ({
        document_id: r.document_id || r.id,
        title: r.title,
        chunk_text: r.chunk_text || r.text,
        score: r.score,
      })),
    };
  } catch (e) {
    console.error('[handleSearch]', e.message);
    return { success: false, error: e.message };
  }
}

async function handleWrite(args, workspaceId, userId) {
  const { title, content, folder_id, folder_name } = args;
  if (!title || !title.trim()) throw new Error('title required');
  if (!content || !content.trim()) throw new Error('content required - must not be empty');
  if (content.trim().length < 10) throw new Error('content too short - must be at least 10 characters');

  try {
    let folderId = folder_id || null;
    if (!folderId && folder_name) {
      const existing = await db('notes_folders').where({ workspace_id: workspaceId, name: folder_name }).select('id').limit(1);

      if (existing.length > 0) {
        folderId = existing[0].id;
      } else {
        const [newFolder] = await db('notes_folders')
          .insert({ workspace_id: workspaceId, name: folder_name, created_by: userId })
          .returning('id');
        folderId = newFolder.id;
      }
    }

    // Check if document with same title already exists (for this user only)
    const userDocs = await db('notes_documents').where({ workspace_id: workspaceId, created_by: userId }).select('id', 'title', 'created_at');

    let matchingDoc = null;
    for (const doc of userDocs) {
      const decryptedTitle = decryptDocument({ title: doc.title }).title;
      if (decryptedTitle === title) {
        matchingDoc = doc;
        break;
      }
    }

    let doc;
    if (matchingDoc) {
      const docId = matchingDoc.id;
      const wordCount = content.trim().split(/\s+/).length;
      const updates = {
        content: textToTipTap(content),
        content_text: content,
        content_html: textToHtml(content),
        word_count: wordCount,
        folder_id: folderId,
        updated_at: db.fn.now(),
        last_edited_by: userId,
      };
      const encryptedUpdates = encryptDocument(updates);

      await db('notes_documents').where({ id: docId }).update(encryptedUpdates);
      doc = { id: docId, created_at: matchingDoc.created_at };
    } else {
      const wordCount = content.trim().split(/\s+/).length;
      const plainDoc = {
        workspace_id: workspaceId,
        folder_id: folderId,
        title,
        content: textToTipTap(content),
        content_text: content,
        content_html: textToHtml(content),
        word_count: wordCount,
        created_by: userId,
        last_edited_by: userId,
      };
      const encryptedDoc = encryptDocument(plainDoc);

      const [newDoc] = await db('notes_documents').insert(encryptedDoc).returning(['id', 'created_at']);
      doc = newDoc;
    }

    if (notesEmbeddingService.indexDocumentAsync) {
      setImmediate(() => {
        const result = notesEmbeddingService.indexDocumentAsync(doc.id, content, userId);
        if (result && typeof result.catch === 'function') result.catch(console.warn);
      });
    }

    return { success: true, document_id: doc.id, title, created_at: doc.created_at };
  } catch (e) {
    console.error('[handleWrite]', e.message);
    return { success: false, error: e.message };
  }
}

async function handleListRecent(args, workspaceId, userId) {
  const { limit = 10, folder_id } = args;

  try {
    let q = db('notes_documents')
      .where({ workspace_id: workspaceId, created_by: userId, is_archived: false })
      .select('id', 'title', 'updated_at', 'word_count', 'is_archived', 'folder_id')
      .orderBy('updated_at', 'desc')
      .limit(limit);
    if (folder_id) q = q.where({ folder_id });

    const docs = await q;

    return {
      success: true,
      documents: docs.map(d => ({
        id: d.id,
        title: decryptDocument({ title: d.title }).title,
        updated_at: d.updated_at,
        word_count: d.word_count || 0,
        folder_id: d.folder_id || null,
      })),
    };
  } catch (e) {
    console.error('[handleListRecent]', e.message);
    return { success: false, error: e.message };
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handleUpdate(args, workspaceId, userId) {
  const { document_id, content_append } = args;
  if (!document_id || !content_append) throw new Error('document_id and content_append required');

  if (!UUID_REGEX.test(document_id)) {
    throw new Error(`Invalid document_id format: "${document_id}". document_id must be a UUID obtained from svaramind_search or svaramind_list_recent results, not arbitrary text.`);
  }

  try {
    const doc = await db('notes_documents').where({ id: document_id }).select('id', 'content_text', 'title', 'content', 'content_html', 'created_by').first();
    if (!doc || doc.created_by !== userId) throw new Error('Document not found or permission denied');

    const decrypted = decryptDocument(doc);
    const updatedContent = (decrypted.content_text || '') + '\n\n' + content_append;

    const wordCount = updatedContent.trim().split(/\s+/).length;
    const updates = {
      content: textToTipTap(updatedContent),
      content_text: updatedContent,
      content_html: textToHtml(updatedContent),
      word_count: wordCount,
      updated_at: db.fn.now(),
    };

    await db('notes_documents').where({ id: document_id }).update(encryptDocument(updates));

    if (notesEmbeddingService.indexDocumentAsync) {
      setImmediate(() => {
        const result = notesEmbeddingService.indexDocumentAsync(document_id, updatedContent, userId);
        if (result && typeof result.catch === 'function') result.catch(console.warn);
      });
    }

    return { success: true, document_id, appended_chars: content_append.length };
  } catch (e) {
    console.error('[handleUpdate]', e.message);
    return { success: false, error: e.message };
  }
}

module.exports = {
  handleJsonRpc,
};
