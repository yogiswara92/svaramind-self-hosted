const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const ENC_PREFIX = '__enc__';  // prefix to detect encrypted text fields
const ENC_JSON_KEY = '_enc';   // key to detect encrypted JSON fields

function getKey() {
  const keyB64 = process.env.NOTES_ENCRYPTION_KEY;
  if (!keyB64) return null;
  return Buffer.from(keyB64, 'base64');
}

function isEncryptionEnabled() {
  return !!process.env.NOTES_ENCRYPTION_KEY;
}

// Encrypt a string → returns "__enc__<base64(iv+authTag+ciphertext)>"
function encrypt(text) {
  if (text === null || text === undefined) return text;
  if (typeof text === 'string' && text.startsWith(ENC_PREFIX)) return text; // already encrypted
  const key = getKey();
  if (!key) return text;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, authTag, encrypted]).toString('base64');
  return `${ENC_PREFIX}${payload}`;
}

// Decrypt a string — transparently handles non-encrypted values
function decrypt(value) {
  if (typeof value !== 'string' || !value.startsWith(ENC_PREFIX)) return value;
  const key = getKey();
  if (!key) return value;
  try {
    const data = Buffer.from(value.slice(ENC_PREFIX.length), 'base64');
    const iv = data.subarray(0, 12);
    const authTag = data.subarray(12, 28);
    const ciphertext = data.subarray(28);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    return value; // return as-is if decryption fails
  }
}

// Encrypt a JSON object → returns {"_enc":"<base64>"} JSONB-compatible
function encryptJson(obj) {
  if (obj === null || obj === undefined) return obj;
  if (obj && typeof obj === 'object' && obj[ENC_JSON_KEY]) return obj; // already encrypted
  const key = getKey();
  if (!key) return obj;
  const json = JSON.stringify(obj);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, authTag, encrypted]).toString('base64');
  return { [ENC_JSON_KEY]: payload };
}

// Decrypt JSONB — transparently handles non-encrypted objects
function decryptJson(obj) {
  if (!obj || typeof obj !== 'object' || !obj[ENC_JSON_KEY]) return obj;
  const key = getKey();
  if (!key) return obj;
  try {
    const data = Buffer.from(obj[ENC_JSON_KEY], 'base64');
    const iv = data.subarray(0, 12);
    const authTag = data.subarray(12, 28);
    const ciphertext = data.subarray(28);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const json = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    return JSON.parse(json);
  } catch {
    return obj;
  }
}

// Encrypt a document object before saving to DB
function encryptDocument(doc) {
  if (!isEncryptionEnabled()) return doc;
  const result = { ...doc };
  if (result.title !== undefined)        result.title = encrypt(result.title);
  if (result.content !== undefined)      result.content = encryptJson(result.content);
  if (result.content_text !== undefined) result.content_text = encrypt(result.content_text);
  if (result.content_html !== undefined) result.content_html = encrypt(result.content_html);
  result.is_encrypted = true;
  return result;
}

// Decrypt a document object after fetching from DB.
// Always attempts decryption — decrypt() is a no-op for non-encrypted values.
function decryptDocument(doc) {
  if (!doc) return doc;
  return {
    ...doc,
    title:        decrypt(doc.title),
    content:      decryptJson(doc.content),
    content_text: decrypt(doc.content_text),
    content_html: decrypt(doc.content_html),
  };
}

// Encrypt/decrypt a RAG chunk
function encryptChunk(text) {
  return isEncryptionEnabled() ? encrypt(text) : text;
}

function decryptChunk(text) {
  return decrypt(text);
}

module.exports = {
  isEncryptionEnabled,
  encrypt, decrypt,
  encryptJson, decryptJson,
  encryptDocument, decryptDocument,
  encryptChunk, decryptChunk
};
