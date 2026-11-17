const express = require('express');
const router = express.Router();
const c = require('../controllers/forum.controller');
const auth = require('../middleware/auth.middleware');

// Fixed paths first, so they are not mistaken for /:id
router.get('/nearby', c.nearby);
router.get('/search', c.search);
router.post('/', auth, c.createPost);

router.get('/:id', c.getPost);
router.post('/:id/comments', auth, c.addComment);
router.post('/:id/vote', auth, c.vote);

module.exports = router;
