const dashboard = require('../services/dashboard.service');
const asyncHandler = require('../utils/asyncHandler');

exports.stats = asyncHandler(async (req, res) => res.json(await dashboard.getStats(req.user.id, req.query)));
