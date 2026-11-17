const http = require('http');
const { Server } = require('socket.io');
const { PORT } = require('./config/env');
const app = require('./app');
const { verifyToken } = require('./middleware/auth.middleware');
const rideService = require('./services/groupRides.service');
const { userRoom, roomOf } = require('./sockets/rideEvents');
const registerLocationSocket = require('./sockets/location.socket');

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.set('io', io);

// Every socket must present a valid login token: io(url, { auth: { token } })
io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    socket.data.userId = verifyToken(token).sub;
    next();
  } catch (err) {
    next(new Error('Invalid or expired token'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.data.userId;
  socket.join(userRoom(userId));
  // If the user is already in an active group ride (e.g. after a reconnect), put them back in its room
  socket.data.ready = rideService.activeRideIdOf(userId)
    .then((rideId) => { if (rideId) socket.join(roomOf(rideId)); })
    .catch((err) => console.error('ride lookup failed', err.message));
  registerLocationSocket(io, socket);
});

server.listen(PORT, () => {
  console.log(`MilesMate backend running on port ${PORT}`);
});
