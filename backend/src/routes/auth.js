const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { signup, login, logout, me, updateProfile, changePassword, getProfileByUsername } = require('../controllers/authController');

router.post('/signup', signup);
router.post('/login', login);
router.get('/profile/:username', getProfileByUsername);

router.use(authenticateToken);
router.post('/logout', logout);
router.get('/me', me);
router.patch('/profile', updateProfile);
router.post('/change-password', changePassword);

module.exports = router;
