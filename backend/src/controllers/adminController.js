const { db } = require('../config/db');
const { encrypt, decrypt, decryptJson } = require('../services/encryptionService');
const { generateEmbedding, indexDocumentAsync } = require('../services/notesEmbeddingService');
const { getAdminDefaultEmbedding } = require('../services/adminLLMService');

const STORAGE_PROVIDERS = ['local', 'minio', 's3', 'r2', 'custom'];
const STORAGE_KEYS = [
  'storage_provider', 'storage_s3_endpoint', 'storage_s3_region', 'storage_s3_bucket',
  'storage_s3_access_key', 'storage_s3_secret_key_enc', 'storage_s3_force_path_style'
];

async function getStorageSettings(_req, res) {
  const rows = await db('admin_settings').whereIn('setting_key', STORAGE_KEYS).select('setting_key', 'setting_value');
  const cfg = Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]));
  res.json({
    storage_provider: cfg.storage_provider || 'local',
    storage_s3_endpoint: cfg.storage_s3_endpoint || '',
    storage_s3_region: cfg.storage_s3_region || 'auto',
    storage_s3_bucket: cfg.storage_s3_bucket || 'notes-images',
    storage_s3_access_key: cfg.storage_s3_access_key || '',
    storage_s3_secret_key_set: !!cfg.storage_s3_secret_key_enc,
    storage_s3_force_path_style: cfg.storage_s3_force_path_style !== false
  });
}

async function updateStorageSettings(req, res) {
  try {
    const {
      storage_provider, storage_s3_endpoint, storage_s3_region, storage_s3_bucket,
      storage_s3_access_key, storage_s3_secret_key, storage_s3_force_path_style
    } = req.body;
    if (storage_provider && !STORAGE_PROVIDERS.includes(storage_provider)) {
      return res.status(400).json({ error: `storage_provider must be one of: ${STORAGE_PROVIDERS.join(', ')}` });
    }

    const updates = [];
    if (storage_provider !== undefined) updates.push(['storage_provider', storage_provider]);
    if (storage_s3_endpoint !== undefined) updates.push(['storage_s3_endpoint', storage_s3_endpoint]);
    if (storage_s3_region !== undefined) updates.push(['storage_s3_region', storage_s3_region]);
    if (storage_s3_bucket !== undefined) updates.push(['storage_s3_bucket', storage_s3_bucket]);
    if (storage_s3_access_key !== undefined) updates.push(['storage_s3_access_key', storage_s3_access_key]);
    if (storage_s3_force_path_style !== undefined) updates.push(['storage_s3_force_path_style', !!storage_s3_force_path_style]);
    // Only overwrite the stored secret if the admin actually typed a new one -
    // the GET endpoint never echoes it back, so an empty submit means "keep as-is".
    if (storage_s3_secret_key) updates.push(['storage_s3_secret_key_enc', encrypt(storage_s3_secret_key)]);

    await db.transaction(async (trx) => {
      for (const [key, value] of updates) {
        await trx('admin_settings')
          .insert({ setting_key: key, setting_value: JSON.stringify(value), updated_by: req.user.id, updated_at: trx.fn.now() })
          .onConflict('setting_key')
          .merge(['setting_value', 'updated_by', 'updated_at']);
      }
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[Admin] updateStorageSettings error:', err);
    res.status(500).json({ error: err.message });
  }
}

const LLM_KEYS = [
  'llm_lock_enabled', 'default_llm_configs', 'default_llm_config_id',
  'embedding_lock_enabled', 'default_embedding_provider', 'default_embedding_model', 'default_embedding_api_key', 'default_embedding_base_url',
  'transcription_lock_enabled', 'default_transcription_provider', 'default_transcription_model', 'default_transcription_api_key', 'default_transcription_base_url'
];

async function getLLMSettings(_req, res) {
  const rows = await db('admin_settings').whereIn('setting_key', LLM_KEYS).select('setting_key', 'setting_value');
  const cfg = Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]));
  res.json({
    llm_lock_enabled: cfg.llm_lock_enabled === true,
    default_llm_configs: Array.isArray(cfg.default_llm_configs) ? cfg.default_llm_configs : [],
    default_llm_config_id: cfg.default_llm_config_id || null,

    embedding_lock_enabled: cfg.embedding_lock_enabled === true,
    default_embedding_provider: cfg.default_embedding_provider || 'openrouter',
    default_embedding_model: cfg.default_embedding_model || '',
    default_embedding_api_key: cfg.default_embedding_api_key || '',
    default_embedding_base_url: cfg.default_embedding_base_url || '',

    transcription_lock_enabled: cfg.transcription_lock_enabled === true,
    default_transcription_provider: cfg.default_transcription_provider || 'openrouter',
    default_transcription_model: cfg.default_transcription_model || '',
    default_transcription_api_key: cfg.default_transcription_api_key || '',
    default_transcription_base_url: cfg.default_transcription_base_url || ''
  });
}

async function updateLLMSettings(req, res) {
  try {
    const {
      llm_lock_enabled, default_llm_configs, default_llm_config_id,
      embedding_lock_enabled, default_embedding_provider, default_embedding_model, default_embedding_api_key, default_embedding_base_url,
      transcription_lock_enabled, default_transcription_provider, default_transcription_model, default_transcription_api_key, default_transcription_base_url
    } = req.body;
    if (default_llm_configs !== undefined && !Array.isArray(default_llm_configs)) {
      return res.status(400).json({ error: 'default_llm_configs must be an array' });
    }

    const updates = [];
    if (llm_lock_enabled !== undefined) updates.push(['llm_lock_enabled', !!llm_lock_enabled]);
    if (default_llm_configs !== undefined) updates.push(['default_llm_configs', default_llm_configs]);
    if (default_llm_config_id !== undefined) updates.push(['default_llm_config_id', default_llm_config_id]);

    if (embedding_lock_enabled !== undefined) updates.push(['embedding_lock_enabled', !!embedding_lock_enabled]);
    if (default_embedding_provider !== undefined) updates.push(['default_embedding_provider', default_embedding_provider]);
    if (default_embedding_model !== undefined) updates.push(['default_embedding_model', default_embedding_model]);
    if (default_embedding_api_key !== undefined) updates.push(['default_embedding_api_key', default_embedding_api_key]);
    if (default_embedding_base_url !== undefined) updates.push(['default_embedding_base_url', default_embedding_base_url]);

    if (transcription_lock_enabled !== undefined) updates.push(['transcription_lock_enabled', !!transcription_lock_enabled]);
    if (default_transcription_provider !== undefined) updates.push(['default_transcription_provider', default_transcription_provider]);
    if (default_transcription_model !== undefined) updates.push(['default_transcription_model', default_transcription_model]);
    if (default_transcription_api_key !== undefined) updates.push(['default_transcription_api_key', default_transcription_api_key]);
    if (default_transcription_base_url !== undefined) updates.push(['default_transcription_base_url', default_transcription_base_url]);

    await db.transaction(async (trx) => {
      for (const [key, value] of updates) {
        await trx('admin_settings')
          .insert({ setting_key: key, setting_value: JSON.stringify(value), updated_by: req.user.id, updated_at: trx.fn.now() })
          .onConflict('setting_key')
          .merge(['setting_value', 'updated_by', 'updated_at']);
      }
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[Admin] updateLLMSettings error:', err);
    res.status(500).json({ error: err.message });
  }
}

// Tests whatever is currently stored as the org-wide default embedding config
// (generateEmbedding with no userId resolves straight to the admin default -
// see getEmbeddingConfig in notesEmbeddingService.js) - lets an admin verify
// the key/model works before locking every user onto it.
async function testDefaultEmbedding(_req, res) {
  const t0 = Date.now();
  const admin = await getAdminDefaultEmbedding();
  try {
    const vec = await generateEmbedding('test probe', null);
    res.json({
      embeddingOk: Array.isArray(vec) && vec.length > 0,
      embeddingDim: vec?.length ?? null,
      embeddingMs: Date.now() - t0,
      provider: admin.provider,
      model: admin.model || null
    });
  } catch (err) {
    res.json({
      embeddingOk: false,
      embeddingError: err.message,
      embeddingMs: Date.now() - t0,
      provider: admin.provider,
      model: admin.model || null
    });
  }
}

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

// Org-wide reindex, e.g. after switching the default embedding model/provider
// (old embeddings were produced by a different model, so they need to be
// regenerated for every user's documents, not just the admin's own).
// force=true bypasses the per-doc "unchanged content" skip in
// indexDocumentAsync, since here the content itself hasn't changed - it's the
// embedding model that has.
async function reindexAllWorkspaces(_req, res) {
  try {
    const docs = await db('notes_documents')
      .where({ is_archived: false })
      .select('id', 'content_text', 'content', 'diagram_xml', 'created_by');

    let queued = 0;
    for (const doc of docs) {
      const text = decrypt(doc.content_text || '').trim();
      if (text.length > 50) {
        const contentJson = decryptJson(doc.content);
        const diagramXml = extractXmlFromContent(contentJson) || doc.diagram_xml || '';
        const fullText = text + xmlToLabels(diagramXml);
        indexDocumentAsync(doc.id, fullText, doc.created_by, true);
        queued++;
      }
    }

    res.json({ queued, total: docs.length });
  } catch (err) {
    console.error('[Admin] reindexAllWorkspaces error:', err);
    res.status(500).json({ error: err.message });
  }
}

async function getReindexAllProgress(_req, res) {
  try {
    const docs = await db('notes_documents').where({ is_archived: false }).select('id');
    const total = docs.length;

    const indexedDocs = docs.length
      ? await db('notes_document_chunks').whereIn('document_id', docs.map((d) => d.id)).select('document_id')
      : [];

    const indexed = new Set(indexedDocs.map((c) => c.document_id)).size;
    res.json({ indexed, total, done: indexed >= total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getStorageSettings, updateStorageSettings, getLLMSettings, updateLLMSettings,
  testDefaultEmbedding, reindexAllWorkspaces, getReindexAllProgress
};
