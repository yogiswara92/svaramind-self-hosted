const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..', 'storage');

function safeJoin(relativePath) {
  const resolved = path.normalize(path.join(ROOT, relativePath));
  if (!resolved.startsWith(ROOT)) throw new Error('Invalid storage path');
  return resolved;
}

async function uploadBuffer({ buffer, storagePath }) {
  const fullPath = safeJoin(storagePath);
  await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.promises.writeFile(fullPath, buffer);
  return { storagePath, publicUrl: `/api/storage/file/${storagePath}` };
}

async function listFiles(prefix) {
  const dir = safeJoin(prefix);
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isFile()).map((e) => ({ name: e.name }));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function removeFiles(paths) {
  await Promise.all(
    paths.map(async (p) => {
      try {
        await fs.promises.unlink(safeJoin(p));
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
    })
  );
}

async function readFile(storagePath) {
  return fs.promises.readFile(safeJoin(storagePath));
}

module.exports = { uploadBuffer, listFiles, removeFiles, readFile };
