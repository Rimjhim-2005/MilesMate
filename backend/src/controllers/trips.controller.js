const trips = require('../services/trips.service');
const asyncHandler = require('../utils/asyncHandler');

exports.create = asyncHandler(async (req, res) => res.status(201).json(await trips.createTrip(req.user.id, req.body)));
exports.list = asyncHandler(async (req, res) => res.json(await trips.listTrips(req.user.id, req.query)));
exports.setEarnings = asyncHandler(async (req, res) => res.json(await trips.setEarnings(req.user.id, req.params.id, req.body)));
