const forum = require('../services/forum.service');
const asyncHandler = require('../utils/asyncHandler');

exports.nearby = asyncHandler(async (req, res) => res.json(await forum.findNearby(req.query)));
exports.search = asyncHandler(async (req, res) => res.json(await forum.search(req.query)));
exports.getPost = asyncHandler(async (req, res) => res.json(await forum.getPost(req.params.id)));
exports.createPost = asyncHandler(async (req, res) => res.status(201).json(await forum.createPost(req.user.id, req.body)));
exports.addComment = asyncHandler(async (req, res) =>
  res.status(201).json(await forum.addComment(req.user.id, req.params.id, req.body)));
exports.vote = asyncHandler(async (req, res) => res.json(await forum.vote(req.user.id, req.params.id, req.body)));
