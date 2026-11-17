// Keeps Socket.IO ride rooms in step with what happens over REST.
// Only the server adds/removes sockets from ride rooms, so a client can never
// join a ride it is not a member of.
const roomOf = (rideId) => `ride:${rideId}`;
const userRoom = (userId) => `user:${userId}`;

function memberJoined(io, rideId, user) {
  io.to(roomOf(rideId)).emit('ride:member_joined', { rideId, userId: user.id, name: user.name });
  io.in(userRoom(user.id)).socketsJoin(roomOf(rideId));
}

function memberLeft(io, rideId, userId) {
  io.to(roomOf(rideId)).except(userRoom(userId)).emit('ride:member_left', { rideId, userId });
  io.in(userRoom(userId)).socketsLeave(roomOf(rideId));
}

function rideEnded(io, rideId) {
  io.to(roomOf(rideId)).emit('ride:ended', { rideId });
  io.in(roomOf(rideId)).socketsLeave(roomOf(rideId));
}

function hostCreated(io, rideId, userId) {
  io.in(userRoom(userId)).socketsJoin(roomOf(rideId));
}

module.exports = { roomOf, userRoom, memberJoined, memberLeft, rideEnded, hostCreated };
