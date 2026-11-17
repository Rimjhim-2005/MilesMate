const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET); // throws if invalid or expired
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  try {
    const payload = verifyToken(header.split(' ')[1]);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = authMiddleware;
module.exports.verifyToken = verifyToken;
