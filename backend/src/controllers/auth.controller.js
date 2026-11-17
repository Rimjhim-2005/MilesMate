const authService = require('../services/auth.service');
const asyncHandler = require('../utils/asyncHandler');

exports.signup = asyncHandler(async (req, res) => res.status(201).json(await authService.signup(req.body)));
exports.login = asyncHandler(async (req, res) => res.json(await authService.login(req.body)));
exports.getMe = asyncHandler(async (req, res) => res.json(await authService.getUser(req.user.id)));
exports.updateMe = asyncHandler(async (req, res) => res.json(await authService.updateUser(req.user.id, req.body)));
