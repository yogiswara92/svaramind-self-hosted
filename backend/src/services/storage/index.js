const { db } = require('../../config/db');

// Selected at runtime from admin_settings.storage_provider (settable from the
// Admin > Storage page), not from an env var - this is the "closed loop"
// requirement: switching backends must not need a restart-with-new-env-file.
const S3_FLAVORS = ['minio', 's3', 'r2', 'custom'];

async function getProvider() {
  const row = await db('admin_settings').where({ setting_key: 'storage_provider' }).first();
  const provider = row ? row.setting_value : 'local';
  return S3_FLAVORS.includes(provider) ? require('./s3StorageAdapter') : require('./localStorageAdapter');
}

async function uploadBuffer(opts) {
  return (await getProvider()).uploadBuffer(opts);
}

async function listFiles(prefix) {
  return (await getProvider()).listFiles(prefix);
}

async function removeFiles(paths) {
  return (await getProvider()).removeFiles(paths);
}

async function readFile(storagePath) {
  return (await getProvider()).readFile(storagePath);
}

module.exports = { uploadBuffer, listFiles, removeFiles, readFile };
