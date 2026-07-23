const express = require('express');
const multer = require('multer');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { upload, serveFile } = require('../controllers/storageController');

const uploadMiddleware = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// <img src> requests can't carry an Authorization header, so the read-only
// file route also accepts the token as a query param. Upload stays header-only.
function authenticateFromHeaderOrQuery(req, res, next) {
  if (req.query.token && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  return authenticateToken(req, res, next);
}

router.post('/upload', authenticateToken, uploadMiddleware.single('file'), upload);
// Express 5 (path-to-regexp v7) requires a named wildcard - req.params.filePath
// comes back as an array of segments, joined in storageController.serveFile.
router.get('/file/*filePath', authenticateFromHeaderOrQuery, serveFile);

module.exports = router;
