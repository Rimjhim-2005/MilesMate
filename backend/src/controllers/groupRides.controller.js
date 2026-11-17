const rides = require('../services/groupRides.service');
const rt = require('../sockets/rideEvents');
const asyncHandler = require('../utils/asyncHandler');

const io = (req) => req.app.get('io');

exports.create = asyncHandler(async (req, res) => {
  const ride = await rides.createRide(req.user.id);
  rt.hostCreated(io(req), ride.id, req.user.id);
  res.status(201).json({ ride });
});

exports.join = asyncHandler(async (req, res) => {
  const { ride, newlyJoined } = await rides.joinRide(req.user.id, req.body);
  if (newlyJoined) {
    const me = ride.members.find((m) => m.userId === req.user.id);
    rt.memberJoined(io(req), ride.id, { id: req.user.id, name: me ? me.name : null });
  }
  res.json({ ride });
});

exports.current = asyncHandler(async (req, res) => res.json({ ride: await rides.getCurrent(req.user.id) }));

exports.leave = asyncHandler(async (req, res) => {
  const { ended } = await rides.leaveRide(req.user.id, req.params.id);
  if (ended) rt.rideEnded(io(req), req.params.id);
  else rt.memberLeft(io(req), req.params.id, req.user.id);
  res.json({ left: true, rideEnded: ended });
});

exports.end = asyncHandler(async (req, res) => {
  await rides.endRide(req.user.id, req.params.id);
  rt.rideEnded(io(req), req.params.id);
  res.json({ rideEnded: true });
});
