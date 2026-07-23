const { db } = require('../config/db');
const notesAIService = require('../services/notesAIService');
const { semanticSearch, indexDocumentAsync, generateEmbedding } = require('../services/notesEmbeddingService');
const { searchGoogle, formatResultsForContext } = require('../services/webSearchService');
const { assertDocumentAccess, assertWorkspaceAccess, handleError } = require('../services/authz');
const { encryptDocument, encryptChunk, isEncryptionEnabled, decrypt, decryptJson } = require('../services/encryptionService');
const { getAdminDefaultLLM, getAdminDefaultEmbedding, getAdminDefaultTranscription } = require('../services/adminLLMService');

async function summarize(req, res) {
  try {
    const userId = req.user.id;
    const { content, length } = req.body;

    if (!content) return res.status(400).json({ error: 'content required' });

    const summary = await notesAIService.summarizeDocument(content, userId, { length });
    res.json({ summary });
  } catch (err) {
    console.error('[Notes AI] summarize error:', err);
    res.status(500).json({ error: err.message });
  }
}

async function extractEntities(req, res) {
  try {
    const userId = req.user.id;
    const { content } = req.body;
    const entities = await notesAIService.extractEntities(content, userId);
    res.json({ entities });
  } catch (err) {
    console.error('[Notes AI] extractEntities error:', err);
    res.status(500).json({ error: err.message });
  }
}

async function extractActionItems(req, res) {
  try {
    const userId = req.user.id;
    const { content } = req.body;
    const items = await notesAIService.extractActionItems(content, userId);
    res.json({ action_items: items });
  } catch (err) {
    console.error('[Notes AI] extractActionItems error:', err);
    res.status(500).json({ error: err.message });
  }
}

async function suggestTags(req, res) {
  try {
    const userId = req.user.id;
    const { title, content } = req.body;
    const tags = await notesAIService.suggestTags(title, content, userId);
    res.json({ tags });
  } catch (err) {
    console.error('[Notes AI] suggestTags error:', err);
    res.status(500).json({ error: err.message });
  }
}

async function generateFAQ(req, res) {
  try {
    const userId = req.user.id;
    const { content, title } = req.body;
    const faq = await notesAIService.generateFAQ(content, title, userId);
    res.json({ faq });
  } catch (err) {
    console.error('[Notes AI] generateFAQ error:', err);
    res.status(500).json({ error: err.message });
  }
}

async function generateSlides(req, res) {
  try {
    const userId = req.user.id;
    const { content, title } = req.body;
    const slides = await notesAIService.generateSlideOutline(content, title, userId);
    res.json({ slides });
  } catch (err) {
    console.error('[Notes AI] generateSlides error:', err);
    res.status(500).json({ error: err.message });
  }
}

async function chat(req, res) {
  try {
    const userId = req.user.id;
    const { content, title, question, history = [], document_id, diagram_xml, llm_config_id, knowledge_scope, web_search } = req.body;
    let { workspace_id } = req.body;

    if (!question) return res.status(400).json({ error: 'question required' });

    // Look up workspace_id + folder_id from document (folder needed for default same-folder scope)
    let docRow = null;
    if (document_id) {
      await assertDocumentAccess(document_id, userId);
      docRow = await db('notes_documents').where({ id: document_id }).select('workspace_id', 'folder_id').first();
      if (!workspace_id) workspace_id = docRow?.workspace_id;
    }

    // Normalize knowledge scope. Default: all notes in the same folder as the current note.
    const scopeMode = knowledge_scope?.mode || 'folder';
    let scope = null;
    if (scopeMode === 'note') {
      scope = { mode: 'note' };
    } else if (scopeMode === 'folders' && knowledge_scope?.folder_ids?.length) {
      scope = { mode: 'folders', folderIds: knowledge_scope.folder_ids };
    } else if (scopeMode === 'workspaces' && knowledge_scope?.workspace_ids?.length) {
      scope = { mode: 'workspaces', workspaceIds: knowledge_scope.workspace_ids };
    } else if (docRow) {
      scope = { mode: 'folders', folderIds: [docRow.folder_id || '__root__'] };
    }

    // Optional web search context
    let webContext = '';
    if (web_search) {
      try {
        const results = await searchGoogle(question);
        webContext = formatResultsForContext(results, question);
      } catch (e) {
        console.warn('[Chat] web search failed:', e.message);
      }
    }

    // Use agentic chat with tool calling support
    const { answer, sources, presentation, diagramXml } = await notesAIService.chatWithNoteAgentic(content, title, question, history, userId, document_id, diagram_xml, workspace_id, webContext, llm_config_id, scope);
    res.json({ answer, sources, presentation: presentation || null, diagram_xml: diagramXml || null });
  } catch (err) { handleError(res, err, 'chat'); }
}

async function semanticSearchHandler(req, res) {
  try {
    const userId = req.user.id;
    const { q, workspace_id, limit = 10 } = req.body;

    if (!q || !workspace_id) return res.status(400).json({ error: 'q and workspace_id required' });
    await assertWorkspaceAccess(workspace_id, userId);

    const results = await semanticSearch(q, workspace_id, userId, parseInt(limit));

    if (results === null) {
      return res.json({ results: null, fallback: true });
    }

    res.json({ results, fallback: false });
  } catch (err) { handleError(res, err, 'semanticSearch'); }
}

async function generatePresentationHandler(req, res) {
  try {
    const userId = req.user.id;
    const { title, content, style, slides, llm_config_id } = req.body;
    if (!content) return res.status(400).json({ error: 'content required' });
    const presentation = await notesAIService.generatePresentation(title || 'Presentation', content, userId, { style, slides, configId: llm_config_id });
    res.json({ presentation });
  } catch (err) {
    console.error('[Notes AI] generatePresentation error:', err);
    res.status(500).json({ error: err.message });
  }
}

async function generateInstagramHandler(req, res) {
  try {
    const userId = req.user.id;
    const { title, content, size, theme, slides, brand, llm_config_id } = req.body;
    if (!content) return res.status(400).json({ error: 'content required' });
    const { html, caption } = await notesAIService.generateInstagramPost(title || 'Note', content, userId, {
      configId: llm_config_id, size, theme, slides, brand
    });
    res.json({ html, caption });
  } catch (err) {
    console.error('[Notes AI] generateInstagram error:', err);
    res.status(500).json({ error: err.message });
  }
}

async function generateDiagramHandler(req, res) {
  try {
    const userId = req.user.id;
    const { prompt, title, content, llm_config_id } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt required' });
    const xml = await notesAIService.generateDiagramXML(prompt, title || 'Note', content || '', userId, llm_config_id);
    res.json({ xml });
  } catch (err) {
    console.error('[Notes AI] generateDiagram error:', err);
    res.status(500).json({ error: err.message });
  }
}

async function improveWriting(req, res) {
  try {
    const userId = req.user.id;
    const { text, instruction } = req.body;

    if (!text || !instruction) return res.status(400).json({ error: 'text and instruction required' });

    const improved = await notesAIService.improveWriting(text, instruction, userId);
    res.json({ improved });
  } catch (err) {
    console.error('[Notes AI] improveWriting error:', err);
    res.status(500).json({ error: err.message });
  }
}

async function expandText(req, res) {
  try {
    const userId = req.user.id;
    const { text, direction } = req.body;
    const expanded = await notesAIService.expandNote(text, direction || 'elaborate', userId);
    res.json({ expanded });
  } catch (err) {
    console.error('[Notes AI] expandText error:', err);
    res.status(500).json({ error: err.message });
  }
}

async function processInsights(req, res) {
  try {
    const userId = req.user.id;
    const { document_id } = req.body;

    if (!document_id) return res.status(400).json({ error: 'document_id required' });
    await assertDocumentAccess(document_id, userId, { write: true });

    notesAIService.processDocumentInsights(document_id, userId);
    res.json({ status: 'processing', message: 'AI analysis started' });
  } catch (err) { handleError(res, err, 'processInsights'); }
}

async function getInsights(req, res) {
  try {
    const userId = req.user.id;
    const { document_id } = req.params;
    await assertDocumentAccess(document_id, userId);

    const data = await db('notes_ai_insights').where({ document_id }).first();
    res.json({ insights: data || null });
  } catch (err) { handleError(res, err, 'getInsights'); }
}

async function generateFromTemplate(req, res) {
  try {
    const userId = req.user.id;
    const { template_prompt, context } = req.body;
    const content = await notesAIService.generateFromTemplate(template_prompt, context || '', userId);
    res.json({ content });
  } catch (err) {
    console.error('[Notes AI] generateFromTemplate error:', err);
    res.status(500).json({ error: err.message });
  }
}

async function encryptWorkspace(req, res) {
  try {
    const userId = req.user.id;
    if (!isEncryptionEnabled()) return res.status(400).json({ error: 'Encryption key not configured' });

    const docs = await db('notes_documents')
      .where({ created_by: userId, is_archived: false })
      .select('id', 'title', 'content', 'content_text', 'content_html', 'is_encrypted');

    const docIds = docs.map(d => d.id);

    let encrypted = 0;
    for (const doc of docs) {
      const titleOk   = !doc.title        || (typeof doc.title === 'string'        && doc.title.startsWith('__enc__'));
      const textOk    = !doc.content_text || (typeof doc.content_text === 'string' && doc.content_text.startsWith('__enc__'));
      const htmlOk    = !doc.content_html || (typeof doc.content_html === 'string' && doc.content_html.startsWith('__enc__'));
      const contentOk = !doc.content      || (doc.content && doc.content._enc);
      if (titleOk && textOk && htmlOk && contentOk) continue;

      const enc = encryptDocument({
        title: doc.title,
        content: doc.content,
        content_text: doc.content_text,
        content_html: doc.content_html
      });
      await db('notes_documents').where({ id: doc.id }).update(enc);
      encrypted++;
    }

    let chunksEncrypted = 0;
    if (docIds.length > 0) {
      const chunks = await db('notes_document_chunks').whereIn('document_id', docIds).select('id', 'chunk_text', 'is_encrypted');

      for (const chunk of chunks) {
        if (typeof chunk.chunk_text === 'string' && chunk.chunk_text.startsWith('__enc__')) continue;
        const encText = encryptChunk(chunk.chunk_text);
        await db('notes_document_chunks').where({ id: chunk.id }).update({ chunk_text: encText, is_encrypted: true });
        chunksEncrypted++;
      }
    }

    res.json({ encrypted, chunksEncrypted, total: docs.length });
  } catch (err) {
    console.error('[Notes] encryptWorkspace error:', err);
    res.status(500).json({ error: err.message });
  }
}

async function reindexWorkspace(req, res) {
  try {
    const userId = req.user.id;
    const { workspace_id } = req.body;
    if (!workspace_id) return res.status(400).json({ error: 'workspace_id required' });
    await assertWorkspaceAccess(workspace_id, userId);

    const docs = await db('notes_documents')
      .where({ workspace_id, created_by: userId, is_archived: false })
      .select('id', 'content_text', 'content', 'diagram_xml');

    function extractXmlFromContent(content) {
      const xmls = [];
      function walk(node) {
        if (!node) return;
        if (node.type === 'drawio' && node.attrs?.xml) xmls.push(node.attrs.xml);
        if (node.content) node.content.forEach(walk);
      }
      walk(content);
      return xmls.join('\n\n');
    }

    function xmlToLabels(xml) {
      if (!xml) return '';
      const re = /(?:value|label)="([^"<>]+)"/g;
      const labels = [];
      let m;
      while ((m = re.exec(xml)) !== null) {
        const v = m[1].trim();
        if (v && v !== '0' && v !== '1') labels.push(v);
      }
      return labels.length ? `\n[Diagram labels: ${labels.join(', ')}]` : '';
    }

    let queued = 0;
    for (const doc of docs) {
      const text = decrypt(doc.content_text || '').trim();
      if (text.length > 50) {
        const contentJson = decryptJson(doc.content);
        const diagramXml = extractXmlFromContent(contentJson) || doc.diagram_xml || '';
        const fullText = text + xmlToLabels(diagramXml);
        indexDocumentAsync(doc.id, fullText, userId);
        queued++;
      }
    }

    res.json({ queued, total: docs.length });
  } catch (err) { handleError(res, err, 'reindexWorkspace'); }
}

async function webSearch(req, res) {
  try {
    const { q, num = 5 } = req.body;
    if (!q) return res.status(400).json({ error: 'q required' });
    const results = await searchGoogle(q, num);
    res.json({ results });
  } catch (err) {
    console.error('[Notes AI] webSearch error:', err);
    res.status(500).json({ error: err.message });
  }
}

async function testEmbedding(req, res) {
  try {
    const userId = req.user.id;
    const { document_id } = req.query;

    const s = await db('notes_settings').where({ user_id: userId }).first();
    const APILOGY_EMBED_BASE = 'https://telkom-ai-dag.api.apilogy.id/Text_Embedding/0.0.1';
    const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

    let debugBaseUrl, debugProvider;
    if (s?.embedding_provider === 'apilogy') {
      debugBaseUrl = s.embedding_base_url || APILOGY_EMBED_BASE;
      debugProvider = 'apilogy';
    } else {
      debugBaseUrl = s?.embedding_base_url || OPENROUTER_BASE;
      debugProvider = s?.embedding_provider || 'openrouter';
    }
    const debugUrl = debugProvider === 'apilogy'
      ? `${debugBaseUrl}/v1/embeddings`
      : `${debugBaseUrl}/embeddings`;

    const apiKey = s?.embedding_api_key || s?.apilogy_api_key;
    const headers = { 'x-api-key': apiKey, 'Content-Type': 'application/json' };
    const probeResults = {};

    if (debugProvider === 'apilogy') {
      const endpoints = [
        { name: 'v1/embeddings/',               url: `${debugBaseUrl}/v1/embeddings/`,               body: { input: 'test', model: 'nomic-embed-text-v2-moe' } },
        { name: 'create/embedding/query/',       url: `${debugBaseUrl}/create/embedding/query/`,       body: { text: 'test' } },
        { name: 'create/embedding/document/',    url: `${debugBaseUrl}/create/embedding/document/`,    body: { text_list: ['test'] } },
        { name: 'v1/embeddings (no slash)',      url: `${debugBaseUrl}/v1/embeddings`,                body: { input: 'test', model: 'nomic-embed-text-v2-moe' } },
      ];
      for (const ep of endpoints) {
        try {
          const r = await fetch(ep.url, { method: 'POST', headers, body: JSON.stringify(ep.body) });
          const text = await r.text();
          probeResults[ep.name] = { status: r.status, body: text.slice(0, 300) };
        } catch (e) {
          probeResults[ep.name] = { status: 'ERR', body: e.message };
        }
      }
    }

    const t0 = Date.now();
    let embeddingOk = false;
    let embeddingError = null;
    let embeddingDim = null;
    try {
      const vec = await generateEmbedding('test probe', userId);
      embeddingOk = Array.isArray(vec) && vec.length > 0;
      embeddingDim = vec?.length;
    } catch (err) {
      embeddingError = err.message;
    }
    const embeddingMs = Date.now() - t0;

    let chunkCount = null;
    let lastIndexed = null;
    if (document_id) {
      const chunks = await db('notes_document_chunks').where({ document_id }).select('id', 'created_at').orderBy('created_at', 'desc');
      chunkCount = chunks.length;
      lastIndexed = chunks[0]?.created_at ?? null;
    }

    res.json({ embeddingOk, embeddingError, embeddingDim, embeddingMs, chunkCount, lastIndexed, debugUrl, debugProvider, probeResults });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function ragProgress(req, res) {
  try {
    const userId = req.user.id;
    const { workspace_id } = req.query;
    if (!workspace_id) return res.status(400).json({ error: 'workspace_id required' });

    const docs = await db('notes_documents')
      .where({ workspace_id, created_by: userId, is_archived: false })
      .select('id');
    const total = docs.length;

    const indexedDocs = docs.length
      ? await db('notes_document_chunks').whereIn('document_id', docs.map(d => d.id)).select('document_id')
      : [];

    const indexed = new Set(indexedDocs.map(c => c.document_id)).size;
    res.json({ indexed, total, done: indexed >= total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Lets the Settings page show "your admin locked this to X" and disable
// editing, without exposing admin_settings (and definitely not API keys) to
// non-admin users - only lock status + the display name of the active model.
async function getAIDefaults(_req, res) {
  try {
    const [llm, embedding, transcription] = await Promise.all([
      getAdminDefaultLLM(),
      getAdminDefaultEmbedding(),
      getAdminDefaultTranscription()
    ]);

    res.json({
      llm: { locked: llm.locked, provider: llm.defaultConfig?.provider || null, model: llm.defaultConfig?.model || null },
      embedding: { locked: embedding.locked, provider: embedding.provider, model: embedding.model || null },
      transcription: { locked: transcription.locked, provider: transcription.provider, model: transcription.model || null }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  summarize,
  extractEntities,
  extractActionItems,
  suggestTags,
  generateFAQ,
  generateSlides,
  chat,
  generatePresentationHandler,
  generateInstagramHandler,
  generateDiagramHandler,
  improveWriting,
  expandText,
  processInsights,
  getInsights,
  generateFromTemplate,
  semanticSearchHandler,
  reindexWorkspace,
  webSearch,
  encryptWorkspace,
  testEmbedding,
  ragProgress,
  getAIDefaults
};
