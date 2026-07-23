const path = require('path');
const storage = require('../services/storage');

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml'
};

function isAllowedPath(requestedPath, userId) {
  return requestedPath.startsWith('documents/') || requestedPath.startsWith(`avatars/${userId}/`);
}

async function upload(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const requestedPath = req.body.path;
    if (!requestedPath || !isAllowedPath(requestedPath, req.user.id)) {
      return res.status(400).json({ error: 'Invalid storage path' });
    }

    const result = await storage.uploadBuffer({
      buffer: req.file.buffer,
      storagePath: requestedPath,
      mimetype: req.file.mimetype
    });
    res.status(201).json(result);
  } catch (err) {
    console.error('[Storage] upload error:', err);
    res.status(500).json({ error: err.message });
  }
}

// Files are served through this authenticated proxy rather than a public
// static mount - closed-loop deployments handling sensitive data shouldn't
// expose an unauthenticated file listing/read surface by default.
async function serveFile(req, res) {
  try {
    // Express 5's named wildcard (*filePath) yields an array of path segments.
    const raw = req.params.filePath;
    const requestedPath = Array.isArray(raw) ? raw.join('/') : raw;
    const buffer = await storage.readFile(requestedPath);
    const ext = path.extname(requestedPath).toLowerCase();
    res.setHeader('Content-Type', MIME_BY_EXT[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(buffer);
  } catch (err) {
    res.status(404).json({ error: 'File not found' });
  }
}

module.exports = { upload, serveFile };
