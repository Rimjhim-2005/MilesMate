const express = require('express');
const router = express.Router();
const c = require('../controllers/auth.controller');

router.post('/signup', c.signup);
router.post('/login', c.login);

module.exports = router;
