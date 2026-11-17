const express = require('express');
const router = express.Router();
const c = require('../controllers/dashboard.controller');
const auth = require('../middleware/auth.middleware');

router.get('/stats', auth, c.stats);

module.exports = router;
