const { db } = require('../config/db');
const crypto = require('crypto');
const { encryptChunk, decryptChunk, isEncryptionEnabled } = require('./encryptionService');
const { getAdminDefaultEmbedding } = require('./adminLLMService');

const OPENROUTER_BASE    = 'https://openrouter.ai/api/v1';
const APILOGY_EMBED_BASE = 'https://telkom-ai-dag.api.apilogy.id/Text_Embedding/0.0.1';
const OLLAMA_DEFAULT_BASE = 'http://localhost:11434/v1';
const EMBEDDING_MODEL    = 'openai/text-embedding-ada-002';
const OLLAMA_DEFAULT_EMBED_MODEL = 'nomic-embed-text';
const CHUNK_SIZE = 400;
const CHUNK_OVERLAP = 50;
const TOP_K = 5;

const lastIndexedHash = new Map(); // documentId → content hash
const lastIndexedTime = new Map(); // documentId → timestamp (ms)
const INDEX_COOLDOWN_MS = 5 * 60_000; // minimum 5 min between re-indexes per doc (safety net)

function contentHash(text) {
  return crypto.createHash('md5').update(text || '').digest('hex');
}

// ── Embedding config (per-user) ───────────────────────────────────────────────

async function getEmbeddingConfig(userId) {
  // ── Admin lock: force everyone onto the org-wide default, no exceptions ───
  const admin = await getAdminDefaultEmbedding();
  if (admin.locked) {
    return { provider: admin.provider, apiKey: admin.apiKey, baseUrl: admin.baseUrl, model: admin.model || EMBEDDING_MODEL };
  }

  if (userId) {
    try {
      const data = await db('notes_settings')
        .where({ user_id: userId })
        .select('embedding_provider', 'embedding_api_key', 'embedding_model', 'embedding_base_url', 'apilogy_api_key', 'ai_api_key')
        .first();

      if (data) {
        const provider = data.embedding_provider || 'openrouter';

        if (provider === 'apilogy') {
          const apiKey = data.embedding_api_key || data.apilogy_api_key;
          if (apiKey) return { provider: 'apilogy', apiKey, baseUrl: data.embedding_base_url || APILOGY_EMBED_BASE, model: null };
        } else if (provider === 'ollama') {
          return { provider: 'ollama', apiKey: data.embedding_api_key || '', baseUrl: data.embedding_base_url || OLLAMA_DEFAULT_BASE, model: data.embedding_model || OLLAMA_DEFAULT_EMBED_MODEL };
        } else {
          // openrouter, openai, or custom
          const apiKey = data.embedding_api_key || data.ai_api_key;
          const baseUrl = data.embedding_base_url || OPENROUTER_BASE;
          const model = data.embedding_model || EMBEDDING_MODEL;
          if (apiKey) return { provider, apiKey, baseUrl, model };
        }
      }
    } catch {}
  }

  // ── Admin default (org-wide, unlocked - used only when the user hasn't configured anything) ──
  if (admin.apiKey || admin.provider === 'ollama') {
    return { provider: admin.provider, apiKey: admin.apiKey, baseUrl: admin.baseUrl, model: admin.model || EMBEDDING_MODEL };
  }

  // ── Last resort: env var ───────────────────────────────────────────────────
  return { provider: 'openrouter', apiKey: process.env.OPENROUTER_API_KEY, baseUrl: OPENROUTER_BASE, model: EMBEDDING_MODEL };
}

// ── Embedding generation ──────────────────────────────────────────────────────

async function generateEmbedding(text, userId = null) {
  const cfg = await getEmbeddingConfig(userId);
  if (!cfg.apiKey && cfg.provider !== 'ollama') throw new Error('No embedding API key configured');

  // Apilogy embedding — endpoint is /v1/embeddings/ (OpenAI-compatible)
  // Docs: https://telkom-ai-dag.api.apilogy.id/Text_Embedding/0.0.1/v1/embeddings/
  if (cfg.provider === 'apilogy') {
    const response = await fetch(`${cfg.baseUrl}/v1/embeddings`, {
      method: 'POST',
      headers: { 'x-api-key': cfg.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: text.slice(0, 8000),
        model: 'nomic-embed-text-v2-moe'  // default model per docs
      })
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Apilogy embedding error ${response.status}: ${err}`);
    }
    const data = await response.json();
    return data.data?.[0]?.embedding || data.embedding || data;
  }

  // Ollama local — OpenAI-compatible /embeddings endpoint, no API key needed
  if (cfg.provider === 'ollama') {
    const headers = { 'Content-Type': 'application/json' };
    if (cfg.apiKey) headers['Authorization'] = `Bearer ${cfg.apiKey}`;
    const response = await fetch(`${cfg.baseUrl}/embeddings`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: cfg.model || OLLAMA_DEFAULT_EMBED_MODEL, input: text.slice(0, 8000) })
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Ollama embedding error ${response.status}: ${err}`);
    }
    const data = await response.json();
    return data.data[0].embedding;
  }

  // OpenRouter / OpenAI / custom embedding
  const response = await fetch(`${cfg.baseUrl}/embeddings`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://yesvara.com' },
    body: JSON.stringify({ model: cfg.model || EMBEDDING_MODEL, input: text.slice(0, 8000) })
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Embedding API error ${response.status}: ${err}`);
  }
  const data = await response.json();
  return data.data[0].embedding;
}

// ── Chunking ─────────────────────────────────────────────────────────────────

function chunkText(text) {
  if (!text || text.length < 50) return [];

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 20) return [text];

  const chunks = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + CHUNK_SIZE, words.length);
    const chunkWords = words.slice(start, end);
    chunks.push(chunkWords.join(' '));
    if (end >= words.length) break;
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }

  return chunks;
}

// ── Store & retrieve chunks ───────────────────────────────────────────────────

async function indexDocument(documentId, text, userId = null, force = false) {
  if (!text || text.trim().length < 50) return;

  const hash = contentHash(text);
  if (!force) {
    // Skip if content hasn't changed since last index
    if (lastIndexedHash.get(documentId) === hash) {
      return; // content unchanged — silent skip
    }

    // Cooldown: don't re-index the same doc within 60s (auto-save fires every 3s)
    const now = Date.now();
    const lastTime = lastIndexedTime.get(documentId) || 0;
    if (now - lastTime < INDEX_COOLDOWN_MS) {
      console.log(`[RAG] Cooldown: skipping re-index for ${documentId} (${Math.round((now - lastTime) / 1000)}s ago, next in ${Math.round((INDEX_COOLDOWN_MS - (now - lastTime)) / 1000)}s)`);
      return;
    }
  }

  // Fetch document metadata for context
  const doc = await db('notes_documents').where({ id: documentId }).select('title', 'updated_at').first();

  const docTitle = doc?.title ? decryptChunk(doc.title) : 'Untitled';
  const docDate = doc?.updated_at ? new Date(doc.updated_at).toLocaleDateString('id-ID') : '';
  console.log(`[RAG] Indexing doc: "${docTitle}" (${docDate})`);

  const chunks = chunkText(text);
  if (chunks.length === 0) return;

  // Delete old chunks
  await db('notes_document_chunks').where({ document_id: documentId }).delete();

  // Generate embeddings for each chunk (batch to avoid rate limits)
  const rows = [];
  for (let i = 0; i < chunks.length; i++) {
    try {
      // Prepend title and date to chunk for embedding context
      const embeddingText = `${docTitle}\n${docDate ? `Updated: ${docDate}` : ''}\n\n${chunks[i]}`.trim();
      const embedding = await generateEmbedding(embeddingText, userId);
      rows.push({
        document_id: documentId,
        chunk_index: i,
        chunk_text: encryptChunk(chunks[i]),
        embedding: JSON.stringify(embedding),
        is_encrypted: isEncryptionEnabled()
      });
    } catch (err) {
      console.warn(`[RAG] Failed to embed chunk ${i} for doc ${documentId}:`, err.message);
    }
  }

  if (rows.length === 0) return;

  try {
    await db('notes_document_chunks').insert(rows);
    lastIndexedHash.set(documentId, hash);
    lastIndexedTime.set(documentId, Date.now());
    console.log(`[RAG] Indexed ${rows.length} chunks for doc ${documentId}`);
  } catch (err) {
    console.error('[RAG] indexDocument insert error:', err.message);
  }
}

// ── Cosine similarity ─────────────────────────────────────────────────────────

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Semantic search across workspace ─────────────────────────────────────────

async function semanticSearch(query, workspaceId, userId, limit = 10) {
  let queryEmbedding;
  try {
    queryEmbedding = await generateEmbedding(query, userId);
  } catch (err) {
    console.warn('[RAG] semanticSearch embedding failed, falling back to text search:', err.message);
    return null; // caller should fall back to FTS
  }

  // Step 1: get doc IDs for this workspace
  const wsDocs = await db('notes_documents')
    .where({ workspace_id: workspaceId, created_by: userId, is_archived: false })
    .select('id');

  const wsDocIds = wsDocs.map(d => d.id);
  if (wsDocIds.length === 0) return [];

  // Step 2: fetch all chunks for those docs
  const chunks = await db('notes_document_chunks')
    .whereIn('document_id', wsDocIds)
    .select('id', 'document_id', 'chunk_index', 'chunk_text', 'embedding');

  if (!chunks?.length) return [];

  // Score each chunk
  const scored = chunks
    .map(c => ({
      ...c,
      score: cosineSimilarity(queryEmbedding, c.embedding)
    }))
    .filter(c => c.score > 0.7)
    .sort((a, b) => b.score - a.score);

  // Deduplicate by document — keep best chunk per doc
  const seen = new Set();
  const topChunks = [];
  for (const chunk of scored) {
    if (!seen.has(chunk.document_id)) {
      seen.add(chunk.document_id);
      topChunks.push(chunk);
    }
    if (topChunks.length >= limit) break;
  }

  if (topChunks.length === 0) return [];

  // Fetch document metadata
  const topDocIds = topChunks.map(c => c.document_id);
  const metaDocs = await db('notes_documents')
    .whereIn('id', topDocIds)
    .select('id', 'title', 'icon', 'folder_id', 'updated_at', 'content_text');

  const docsMap = Object.fromEntries(metaDocs.map(d => [d.id, {
    ...d,
    title: decryptChunk(d.title),
    content_text: decryptChunk(d.content_text)
  }]));

  return topChunks.map(chunk => ({
    ...docsMap[chunk.document_id],
    chunk_text: decryptChunk(chunk.chunk_text),
    score: chunk.score,
    rank: chunk.score
  })).filter(r => r.id);
}

// ── Cross-note RAG: relevant chunks across workspace ──────────────────────────

// scope: { mode: 'folders', folderIds: [...] } | { mode: 'workspaces', workspaceIds: [...] } | null (whole workspace)
// folderIds may contain '__root__' meaning docs with no folder in the current workspace
async function getCrossNoteChunks(query, workspaceId, userId, excludeDocId, topK = 4, scope = null) {
  let queryEmbedding;
  try {
    queryEmbedding = await generateEmbedding(query, userId);
  } catch (err) {
    console.warn('[RAG] getCrossNoteChunks embedding failed:', err.message);
    return null;
  }

  // Step 1: fetch doc IDs within the knowledge scope (excluding current doc)
  let docsQuery = db('notes_documents')
    .where({ created_by: userId, is_archived: false })
    .whereNot({ id: excludeDocId })
    .select('id', 'title');

  if (scope?.mode === 'workspaces' && scope.workspaceIds?.length) {
    docsQuery = docsQuery.whereIn('workspace_id', scope.workspaceIds);
  } else if (scope?.mode === 'folders' && scope.folderIds?.length) {
    const realIds = scope.folderIds.filter(id => id && id !== '__root__');
    const hasRoot = scope.folderIds.includes('__root__');
    docsQuery = docsQuery.where({ workspace_id: workspaceId });
    if (realIds.length && hasRoot) {
      docsQuery = docsQuery.where(function () { this.whereIn('folder_id', realIds).orWhereNull('folder_id'); });
    } else if (hasRoot) {
      docsQuery = docsQuery.whereNull('folder_id');
    } else {
      docsQuery = docsQuery.whereIn('folder_id', realIds);
    }
  } else {
    docsQuery = docsQuery.where({ workspace_id: workspaceId });
  }

  const docs = await docsQuery;

  if (!docs?.length) {
    console.log('[RAG] getCrossNoteChunks: no other docs found in scope', scope?.mode || 'workspace');
    return null;
  }

  const docIds = docs.map(d => d.id);
  const titleMap = Object.fromEntries(docs.map(d => [d.id, decryptChunk(d.title)]));

  // Step 2: fetch all chunks for those docs
  const chunks = await db('notes_document_chunks')
    .whereIn('document_id', docIds)
    .select('document_id', 'chunk_text', 'chunk_index', 'embedding');

  if (!chunks?.length) {
    console.log('[RAG] getCrossNoteChunks: no indexed chunks found for workspace docs');
    return null;
  }

  console.log(`[RAG] getCrossNoteChunks: scoring ${chunks.length} chunks from ${docIds.length} docs`);

  // Step 3: score and rank
  const scored = chunks
    .map(c => ({ ...c, score: cosineSimilarity(queryEmbedding, c.embedding) }))
    .filter(c => c.score > 0.65)
    .sort((a, b) => b.score - a.score);

  // One best chunk per document
  const seen = new Set();
  const top = [];
  for (const c of scored) {
    if (!seen.has(c.document_id)) {
      seen.add(c.document_id);
      top.push(c);
    }
    if (top.length >= topK) break;
  }

  if (!top.length) {
    console.log('[RAG] getCrossNoteChunks: no chunks above threshold');
    return null;
  }

  console.log(`[RAG] getCrossNoteChunks: found ${top.length} relevant cross-note chunks`);

  const sources = top.map(c => ({
    documentId: c.document_id,
    title: titleMap[c.document_id] || 'Untitled',
    chunkText: decryptChunk(c.chunk_text),
    score: Math.round(c.score * 100) / 100,
    isCrossNote: true
  }));

  const context = sources
    .map(s => `[From note "${s.title}"]\n${s.chunkText}`)
    .join('\n\n---\n\n');

  return { context, sources };
}

// ── Get relevant chunks for a specific document (for AI chat RAG) ─────────────

async function getRelevantChunks(query, documentId, topK = TOP_K, userId = null) {
  let queryEmbedding;
  try {
    queryEmbedding = await generateEmbedding(query, userId);
  } catch {
    return null;
  }

  const chunks = await db('notes_document_chunks')
    .where({ document_id: documentId })
    .select('chunk_text', 'chunk_index', 'embedding')
    .orderBy('chunk_index');

  if (!chunks?.length) return null;

  const scored = chunks
    .map(c => ({ ...c, score: cosineSimilarity(queryEmbedding, c.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .sort((a, b) => a.chunk_index - b.chunk_index);

  const sources = scored.map(c => ({
    documentId,
    chunkText: decryptChunk(c.chunk_text),
    score: Math.round(c.score * 100) / 100,
    isCrossNote: false
  }));

  return { context: scored.map(c => decryptChunk(c.chunk_text)).join('\n\n---\n\n'), sources };
}

// ── Background indexing (non-blocking) ───────────────────────────────────────

function indexDocumentAsync(documentId, text, userId = null, force = false) {
  if (!text || text.trim().length < 50) return { status: 'skipped', reason: 'too_short' };

  if (!force) {
    // Sync checks — return status immediately without blocking save
    const hash = contentHash(text);
    if (lastIndexedHash.get(documentId) === hash) {
      return { status: 'skipped', reason: 'unchanged' };
    }

    const now = Date.now();
    const lastTime = lastIndexedTime.get(documentId) || 0;
    if (now - lastTime < INDEX_COOLDOWN_MS) {
      const remainSec = Math.round((INDEX_COOLDOWN_MS - (now - lastTime)) / 60000);
      return { status: 'skipped', reason: 'cooldown', remainMin: remainSec };
    }
  }

  // Fire and forget — actual indexing runs in background
  setImmediate(async () => {
    try {
      await indexDocument(documentId, text, userId, force);
      console.log(`[RAG] ✓ Indexed: ${documentId}`);
    } catch (err) {
      console.error(`[RAG] ✗ Index failed: ${documentId} —`, err.message);
    }
  });

  return { status: 'indexing' };
}

module.exports = {
  generateEmbedding,
  indexDocument,
  indexDocumentAsync,
  semanticSearch,
  getRelevantChunks,
  getCrossNoteChunks,
  chunkText
};
