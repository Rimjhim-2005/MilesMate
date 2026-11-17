const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config/env');
const HttpError = require('../utils/httpError');
const v = require('../utils/validate');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const publicUser = (r) => ({
  id: r.id,
  name: r.name,
  email: r.email,
  vehicleInfo: r.vehicle_info,
  createdAt: r.created_at,
});

const signToken = (user) => jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

async function signup(body = {}) {
  const name = v.text(body.name, 'name', { max: 100 });
  const email = v.text(body.email, 'email', { max: 255 }).toLowerCase();
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'email must be a valid email address');
  const password = body.password;
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
    throw new HttpError(400, 'password must be 8 to 72 characters');
  }
  const vehicleInfo = v.text(body.vehicleInfo, 'vehicleInfo', { max: 255, required: false }) ?? null;

  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, vehicle_info)
       VALUES ($1, $2, $3, $4) RETURNING id, name, email, vehicle_info, created_at`,
      [name, email, hash, vehicleInfo]
    );
    return { token: signToken(rows[0]), user: publicUser(rows[0]) };
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'An account with this email already exists');
    throw err;
  }
}

async function login(body = {}) {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) throw new HttpError(400, 'email and password are required');

  const { rows } = await pool.query(
    `SELECT id, name, email, vehicle_info, created_at, password_hash FROM users WHERE email = $1`, [email]
  );
  const ok = rows[0] && (await bcrypt.compare(password, rows[0].password_hash));
  if (!ok) throw new HttpError(401, 'Invalid email or password');
  return { token: signToken(rows[0]), user: publicUser(rows[0]) };
}

async function getUser(id) {
  const { rows } = await pool.query(
    `SELECT id, name, email, vehicle_info, created_at FROM users WHERE id = $1`, [id]
  );
  if (!rows[0]) throw new HttpError(404, 'User not found');
  return publicUser(rows[0]);
}

async function updateUser(id, body = {}) {
  const sets = [];
  const params = [id];
  if (body.name !== undefined) {
    params.push(v.text(body.name, 'name', { max: 100 }));
    sets.push(`name = $${params.length}`);
  }
  if (body.vehicleInfo !== undefined) {
    params.push(v.text(body.vehicleInfo, 'vehicleInfo', { max: 255, required: false }) ?? null);
    sets.push(`vehicle_info = $${params.length}`);
  }
  if (!sets.length) throw new HttpError(400, 'Send name and/or vehicleInfo to update');

  const { rows } = await pool.query(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $1
     RETURNING id, name, email, vehicle_info, created_at`, params
  );
  if (!rows[0]) throw new HttpError(404, 'User not found');
  return publicUser(rows[0]);
}

module.exports = { signup, login, getUser, updateUser };
