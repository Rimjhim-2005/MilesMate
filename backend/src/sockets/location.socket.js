const redis = require('../config/redis');
const { userRoom } = require('./rideEvents');

const RADIUS_KM = 1;
const LOCATION_TTL_SECONDS = 15; // position disappears if updates stop for 15 s

// userId -> Set of userIds who currently have this user's marker.
// Used so "removed" messages go only to people who actually saw the user.
const shownTo = new Map();
const markShown = (owner, viewer) => {
  if (!shownTo.has(owner)) shownTo.set(owner, new Set());
  shownTo.get(owner).add(viewer);
};

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const rideRoomOf = (socket) => [...socket.rooms].find((r) => r.startsWith('ride:'));
const validCoord = (n, limit) => Number.isFinite(n) && Math.abs(n) <= limit;

async function stopSharing(io, userId, rideRoom) {
  await redis.del(`live_location:${userId}`);
  const viewers = shownTo.get(userId);
  if (viewers) {
    for (const viewer of viewers) io.to(userRoom(viewer)).emit('nearby:location_removed', { userId });
    shownTo.delete(userId);
  }
  if (rideRoom) io.to(rideRoom).except(userRoom(userId)).emit('ride:location_removed', { userId });
}

module.exports = function registerLocationSocket(io, socket) {
  const userId = socket.data.userId; // set from the verified login token, never from the client
  let rideRoomAtDisconnect;

  socket.on('location:update', async (data) => {
    try {
      await socket.data.ready;
      const lat = Number(data && data.lat);
      const lng = Number(data && data.lng);
      if (!validCoord(lat, 90) || !validCoord(lng, 180)) {
        return socket.emit('location:error', { message: 'lat and lng must be valid coordinates' });
      }

      await redis.set(`live_location:${userId}`, JSON.stringify({ lat, lng, ts: Date.now() }), 'EX', LOCATION_TTL_SECONDS);

      // Group ride members see each other at any distance
      const rideRoom = rideRoomOf(socket);
      if (rideRoom) socket.to(rideRoom).emit('ride:location', { userId, lat, lng });

      // Everyone else who is sharing within 1 km
      const keys = (await redis.keys('live_location:*')).filter((k) => k !== `live_location:${userId}`);
      if (!keys.length) return;
      const values = await redis.mget(keys);
      keys.forEach((key, i) => {
        if (!values[i]) return;
        const otherId = key.split(':')[1];
        const other = JSON.parse(values[i]);
        if (haversineKm(lat, lng, other.lat, other.lng) <= RADIUS_KM) {
          io.to(userRoom(otherId)).emit('nearby:location', { userId, lat, lng });
          io.to(userRoom(userId)).emit('nearby:location', { userId: otherId, lat: other.lat, lng: other.lng });
          markShown(userId, otherId);
          markShown(otherId, userId);
        }
      });
    } catch (err) {
      console.error('location:update failed', err.message);
    }
  });

  socket.on('location:stop_sharing', async () => {
    try {
      await stopSharing(io, userId, rideRoomOf(socket));
    } catch (err) {
      console.error('location:stop_sharing failed', err.message);
    }
  });

  socket.on('disconnecting', () => { rideRoomAtDisconnect = rideRoomOf(socket); });

  socket.on('disconnect', async () => {
    try {
      // Only stop sharing if this was the user's last open connection (e.g. second browser tab)
      const remaining = await io.in(userRoom(userId)).fetchSockets();
      if (remaining.length === 0) await stopSharing(io, userId, rideRoomAtDisconnect);
    } catch (err) {
      console.error('disconnect cleanup failed', err.message);
    }
  });
};
