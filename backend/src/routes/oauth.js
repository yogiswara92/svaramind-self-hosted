const express = require('express');
const oauthController = require('../controllers/oauthController');

const router = express.Router();

router.post('/register', oauthController.registerClient);
router.get('/authorize', oauthController.showAuthorize);
router.post('/authorize', oauthController.handleAuthorizeSubmit);
router.post('/token', oauthController.handleToken);

module.exports = router;
