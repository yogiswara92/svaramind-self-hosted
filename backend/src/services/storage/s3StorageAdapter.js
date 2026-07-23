const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { db } = require('../../config/db');
const { decrypt } = require('../encryptionService');

// Generic S3-compatible adapter - serves MinIO, real AWS S3, Cloudflare R2,
// or any other S3-compatible store. Unlike svarabase/server/src/config/r2.ts
// (which hardcodes the R2 endpoint format), the endpoint here is fully
// configurable, and "flavor" (chosen in the admin UI) only decides what
// defaults/placeholders are shown - the code path is identical either way.
const CONFIG_KEYS = [
  'storage_provider', 'storage_s3_endpoint', 'storage_s3_region', 'storage_s3_bucket',
  'storage_s3_access_key', 'storage_s3_secret_key_enc', 'storage_s3_force_path_style'
];

async function getConfig() {
  const rows = await db('admin_settings').whereIn('setting_key', CONFIG_KEYS).select('setting_key', 'setting_value');
  const cfg = Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]));
  return {
    flavor: cfg.storage_provider || 'minio', // minio | s3 | r2 | custom - decides whether endpoint is required
    endpoint: cfg.storage_s3_endpoint || '',
    region: cfg.storage_s3_region || 'auto',
    bucket: cfg.storage_s3_bucket || 'notes-images',
    accessKeyId: cfg.storage_s3_access_key || '',
    secretAccessKey: decrypt(cfg.storage_s3_secret_key_enc || ''),
    forcePathStyle: cfg.storage_s3_force_path_style !== false
  };
}

async function getClient() {
  const cfg = await getConfig();
  // Real AWS S3 can resolve its endpoint from the region alone; every other
  // flavor (MinIO, R2, custom) needs an explicit endpoint URL.
  if (!cfg.endpoint && cfg.flavor !== 's3') {
    throw new Error('S3-compatible storage is not configured yet - set it up in Admin > Storage');
  }
  const client = new S3Client({
    ...(cfg.endpoint ? { endpoint: cfg.endpoint } : {}),
    region: cfg.region,
    forcePathStyle: cfg.forcePathStyle,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey }
  });
  return { client, bucket: cfg.bucket };
}

async function uploadBuffer({ buffer, storagePath, mimetype }) {
  const { client, bucket } = await getClient();
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: storagePath, Body: buffer, ContentType: mimetype }));
  return { storagePath, publicUrl: `/api/storage/file/${storagePath}` };
}

async function listFiles(prefix) {
  const { client, bucket } = await getClient();
  const res = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
  return (res.Contents || []).map((obj) => ({ name: obj.Key.slice(prefix.length).replace(/^\//, '') }));
}

async function removeFiles(paths) {
  if (!paths.length) return;
  const { client, bucket } = await getClient();
  await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: paths.map((Key) => ({ Key })) } }));
}

async function readFile(storagePath) {
  const { client, bucket } = await getClient();
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: storagePath }));
  const chunks = [];
  for await (const chunk of res.Body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

module.exports = { uploadBuffer, listFiles, removeFiles, readFile };
