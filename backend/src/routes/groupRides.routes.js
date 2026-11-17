const express = require('express');
const router = express.Router();
const c = require('../controllers/groupRides.controller');
const auth = require('../middleware/auth.middleware');

router.post('/', auth, c.create);
router.post('/join', auth, c.join);
router.get('/current', auth, c.current);
router.post('/:id/leave', auth, c.leave);
router.post('/:id/end', auth, c.end);

module.exports = router;
