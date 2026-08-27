const express = require('express');
const fileCtrl = require('../controllers/file.controller');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * Optional auth: public assets (logos) must load without a session, while
 * everything else is rejected inside the controller when req.user is absent.
 */
router.get(/^\/(.+)$/, optionalAuth, fileCtrl.serve);

module.exports = router;
