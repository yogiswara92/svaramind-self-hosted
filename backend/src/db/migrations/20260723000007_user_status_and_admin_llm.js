// Adds account status (for admin user management) and seeds the admin_settings
// keys used by the org-wide "Default LLM" feature (with an optional lock that
// forces every user onto the admin-chosen model regardless of their own BYOK
// config in notes_settings.llm_configs).

exports.up = async function (knex) {
  await knex.schema.alterTable('profiles', (t) => {
    t.boolean('is_active').notNullable().defaultTo(true);
  });

  await knex('admin_settings').insert([
    { setting_key: 'llm_lock_enabled', setting_value: JSON.stringify(false), description: 'When true, force all users onto default_llm_configs regardless of their own LLM settings' },
    { setting_key: 'default_llm_configs', setting_value: JSON.stringify([]), description: 'Org-wide default LLM models, same shape as notes_settings.llm_configs' },
    { setting_key: 'default_llm_config_id', setting_value: JSON.stringify(null), description: 'Which entry in default_llm_configs is the default' }
  ]);
};

exports.down = async function (knex) {
  await knex('admin_settings').whereIn('setting_key', ['llm_lock_enabled', 'default_llm_configs', 'default_llm_config_id']).delete();
  await knex.schema.alterTable('profiles', (t) => {
    t.dropColumn('is_active');
  });
};
