// Generic key/value settings table (mirrors database_migration.sql's admin_settings),
// now with a real CRUD API + admin UI on top (see controllers/adminController.js and
// frontend/src/pages/admin/AdminSettingsPage.svelte) instead of being read-only.

exports.up = async function (knex) {
  await knex.schema.createTable('admin_settings', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('setting_key').notNullable().unique();
    t.jsonb('setting_value').notNullable();
    t.text('description');
    t.uuid('updated_by').references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex('admin_settings').insert([
    { setting_key: 'storage_provider', setting_value: JSON.stringify('local'), description: 'Active storage backend: local or minio' },
    { setting_key: 'storage_minio_endpoint', setting_value: JSON.stringify(''), description: 'MinIO endpoint URL, e.g. http://localhost:9000' },
    { setting_key: 'storage_minio_bucket', setting_value: JSON.stringify('notes-images'), description: 'MinIO bucket name' },
    { setting_key: 'storage_minio_access_key', setting_value: JSON.stringify(''), description: 'MinIO access key' },
    { setting_key: 'storage_minio_secret_key_enc', setting_value: JSON.stringify(''), description: 'MinIO secret key, AES-encrypted at rest' }
  ]);
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('admin_settings');
};
