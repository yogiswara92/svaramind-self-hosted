// Extends the org-wide "Default LLM" admin feature (chat model + lock) to
// also cover Embedding and Transcription (STT), each with its own
// independent lock switch - an admin might want to lock the embedding model
// (so search stays consistent across the org) without locking chat or STT.

exports.up = async function (knex) {
  await knex('admin_settings').insert([
    { setting_key: 'embedding_lock_enabled', setting_value: JSON.stringify(false), description: 'When true, force all users onto the default embedding config below' },
    { setting_key: 'default_embedding_provider', setting_value: JSON.stringify('openrouter'), description: 'Org-wide default embedding provider' },
    { setting_key: 'default_embedding_model', setting_value: JSON.stringify('openai/text-embedding-ada-002'), description: 'Org-wide default embedding model' },
    { setting_key: 'default_embedding_api_key', setting_value: JSON.stringify(''), description: 'Org-wide default embedding API key' },
    { setting_key: 'default_embedding_base_url', setting_value: JSON.stringify(''), description: 'Org-wide default embedding base URL (blank = provider default)' },

    { setting_key: 'transcription_lock_enabled', setting_value: JSON.stringify(false), description: 'When true, force all users onto the default transcription config below' },
    { setting_key: 'default_transcription_provider', setting_value: JSON.stringify('openrouter'), description: 'Org-wide default transcription provider' },
    { setting_key: 'default_transcription_model', setting_value: JSON.stringify('google/gemini-2.0-flash-001'), description: 'Org-wide default transcription model' },
    { setting_key: 'default_transcription_api_key', setting_value: JSON.stringify(''), description: 'Org-wide default transcription API key' },
    { setting_key: 'default_transcription_base_url', setting_value: JSON.stringify(''), description: 'Org-wide default transcription base URL (blank = provider default)' }
  ]).onConflict('setting_key').ignore();
};

exports.down = async function (knex) {
  await knex('admin_settings').whereIn('setting_key', [
    'embedding_lock_enabled', 'default_embedding_provider', 'default_embedding_model', 'default_embedding_api_key', 'default_embedding_base_url',
    'transcription_lock_enabled', 'default_transcription_provider', 'default_transcription_model', 'default_transcription_api_key', 'default_transcription_base_url'
  ]).delete();
};
