const express = require('express');
const router = express.Router();
const c = require('../controllers/auth.controller');
const auth = require('../middleware/auth.middleware');

router.get('/me', auth, c.getMe);
router.put('/me', auth, c.updateMe);

module.exports = router;
