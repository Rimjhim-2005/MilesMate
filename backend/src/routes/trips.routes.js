const express = require('express');
const router = express.Router();
const c = require('../controllers/trips.controller');
const auth = require('../middleware/auth.middleware');

router.post('/', auth, c.create);
router.get('/', auth, c.list);
router.patch('/:id', auth, c.setEarnings);

module.exports = router;
