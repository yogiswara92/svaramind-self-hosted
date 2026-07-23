const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/requireAdmin');
const {
  getStorageSettings, updateStorageSettings, getLLMSettings, updateLLMSettings,
  testDefaultEmbedding, reindexAllWorkspaces, getReindexAllProgress
} = require('../controllers/adminController');
const { listUsers, createUser, updateUser, deleteUser } = require('../controllers/adminUsersController');

router.use(authenticateToken, requireAdmin);

router.get('/settings/storage', getStorageSettings);
router.patch('/settings/storage', updateStorageSettings);

router.get('/settings/llm', getLLMSettings);
router.patch('/settings/llm', updateLLMSettings);
router.get('/settings/llm/test-embedding', testDefaultEmbedding);
router.post('/settings/llm/reindex-all', reindexAllWorkspaces);
router.get('/settings/llm/reindex-progress', getReindexAllProgress);

router.get('/users', listUsers);
router.post('/users', createUser);
router.patch('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);

module.exports = router;
