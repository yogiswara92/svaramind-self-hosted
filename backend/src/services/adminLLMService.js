const { db } = require('../config/db');

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const APILOGY_LLM_BASE = 'https://telkom-ai-dag.api.apilogy.id/Telkom-LLM/0.0.4/llm';
const APILOGY_EMBED_BASE = 'https://telkom-ai-dag.api.apilogy.id/Text_Embedding/0.0.1';
const OLLAMA_DEFAULT_BASE = 'http://localhost:11434/v1';

function resolveBaseUrl(provider, config) {
  if (provider === 'apilogy') return APILOGY_LLM_BASE;
  if (provider === 'ollama') return config.base_url || OLLAMA_DEFAULT_BASE;
  return config.base_url || OPENROUTER_BASE;
}

function resolveEmbeddingBaseUrl(provider, baseUrl) {
  if (provider === 'apilogy') return baseUrl || APILOGY_EMBED_BASE;
  if (provider === 'ollama') return baseUrl || OLLAMA_DEFAULT_BASE;
  return baseUrl || OPENROUTER_BASE;
}

// Reads the org-wide default LLM config set by an admin in Settings > Admin > Default LLM.
// `locked` means: ignore every user's own BYOK config and always use this one.
async function getAdminDefaultLLM() {
  const rows = await db('admin_settings')
    .whereIn('setting_key', ['llm_lock_enabled', 'default_llm_configs', 'default_llm_config_id'])
    .select('setting_key', 'setting_value');
  const cfg = Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]));

  const configs = Array.isArray(cfg.default_llm_configs) ? cfg.default_llm_configs : [];
  const defaultId = cfg.default_llm_config_id || null;
  const defaultConfig = configs.find((c) => c.id === defaultId) || configs[0] || null;

  return { locked: cfg.llm_lock_enabled === true, configs, defaultConfig };
}

// Same idea as getAdminDefaultLLM but for the Embedding config (used by
// notesEmbeddingService.js for search/RAG).
async function getAdminDefaultEmbedding() {
  const rows = await db('admin_settings')
    .whereIn('setting_key', ['embedding_lock_enabled', 'default_embedding_provider', 'default_embedding_model', 'default_embedding_api_key', 'default_embedding_base_url'])
    .select('setting_key', 'setting_value');
  const cfg = Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]));

  const provider = cfg.default_embedding_provider || 'openrouter';
  return {
    locked: cfg.embedding_lock_enabled === true,
    provider,
    model: cfg.default_embedding_model || '',
    apiKey: cfg.default_embedding_api_key || '',
    baseUrl: resolveEmbeddingBaseUrl(provider, cfg.default_embedding_base_url)
  };
}

// Same idea again but for Transcription (STT) (used by notesTranscribeController.js).
async function getAdminDefaultTranscription() {
  const rows = await db('admin_settings')
    .whereIn('setting_key', ['transcription_lock_enabled', 'default_transcription_provider', 'default_transcription_model', 'default_transcription_api_key', 'default_transcription_base_url'])
    .select('setting_key', 'setting_value');
  const cfg = Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]));

  return {
    locked: cfg.transcription_lock_enabled === true,
    provider: cfg.default_transcription_provider || 'openrouter',
    model: cfg.default_transcription_model || '',
    apiKey: cfg.default_transcription_api_key || '',
    baseUrl: cfg.default_transcription_base_url || 'https://openrouter.ai/api/v1'
  };
}

// Shape used by chat (notesAIService.js, notesGlobalChatController.js).
function toChatConfig(target, language = 'auto') {
  if (!target) return null;
  const provider = target.provider || 'openrouter';
  return {
    model: target.model,
    apiKey: target.api_key || '',
    baseUrl: resolveBaseUrl(provider, target),
    provider,
    language
  };
}

module.exports = {
  getAdminDefaultLLM, getAdminDefaultEmbedding, getAdminDefaultTranscription,
  toChatConfig, resolveBaseUrl,
  OPENROUTER_BASE, APILOGY_LLM_BASE, APILOGY_EMBED_BASE, OLLAMA_DEFAULT_BASE
};
