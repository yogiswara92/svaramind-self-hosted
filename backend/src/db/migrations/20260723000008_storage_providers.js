// Generalizes storage settings from "local vs MinIO" to "local vs any
// S3-compatible backend" (MinIO, AWS S3, Cloudflare R2, or a custom
// S3-compatible endpoint). All non-local flavors share the same adapter
// (services/storage/s3StorageAdapter.js) and the same config keys below -
// the flavor picked in the admin UI just decides which placeholder/defaults
// are shown, not a different code path.

exports.up = async function (knex) {
  const renames = [
    ['storage_minio_endpoint', 'storage_s3_endpoint'],
    ['storage_minio_bucket', 'storage_s3_bucket'],
    ['storage_minio_access_key', 'storage_s3_access_key'],
    ['storage_minio_secret_key_enc', 'storage_s3_secret_key_enc']
  ];

  for (const [oldKey, newKey] of renames) {
    const row = await knex('admin_settings').where({ setting_key: oldKey }).first();
    if (row) {
      await knex('admin_settings').where({ setting_key: oldKey }).update({ setting_key: newKey });
    }
  }

  await knex('admin_settings').insert([
    { setting_key: 'storage_s3_region', setting_value: JSON.stringify('auto'), description: 'S3 region - "auto" works for MinIO/R2, real AWS S3 needs an actual region e.g. us-east-1' },
    { setting_key: 'storage_s3_force_path_style', setting_value: JSON.stringify(true), description: 'Path-style addressing - required by MinIO and most self-hosted S3-compatible stores, usually off for real AWS S3' }
  ]).onConflict('setting_key').ignore();
};

exports.down = async function (knex) {
  await knex('admin_settings').whereIn('setting_key', ['storage_s3_region', 'storage_s3_force_path_style']).delete();

  const renames = [
    ['storage_s3_endpoint', 'storage_minio_endpoint'],
    ['storage_s3_bucket', 'storage_minio_bucket'],
    ['storage_s3_access_key', 'storage_minio_access_key'],
    ['storage_s3_secret_key_enc', 'storage_minio_secret_key_enc']
  ];
  for (const [oldKey, newKey] of renames) {
    const row = await knex('admin_settings').where({ setting_key: oldKey }).first();
    if (row) {
      await knex('admin_settings').where({ setting_key: oldKey }).update({ setting_key: newKey });
    }
  }
};
