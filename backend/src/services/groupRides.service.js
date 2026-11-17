const crypto = require('crypto');
const { pool } = require('../config/db');
const HttpError = require('../utils/httpError');
const v = require('../utils/validate');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I, easy to read out loud
const MAX_MEMBERS = 20;

const newCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');

async function activeRideIdOf(db, userId) {
  const { rows } = await db.query(
    `SELECT m.group_ride_id FROM group_ride_members m
     JOIN group_rides r ON r.id = m.group_ride_id
     WHERE m.user_id = $1 AND m.left_at IS NULL AND r.status = 'active'`,
    [userId]
  );
  return rows[0] ? rows[0].group_ride_id : null;
}

async function getRide(rideId, db = pool) {
  const ride = await db.query(
    `SELECT id, host_id, invite_code, status, created_at, ended_at FROM group_rides WHERE id = $1`, [rideId]
  );
  if (!ride.rows[0]) return null;
  const members = await db.query(
    `SELECT m.user_id, u.name, m.joined_at
     FROM group_ride_members m JOIN users u ON u.id = m.user_id
     WHERE m.group_ride_id = $1 AND m.left_at IS NULL ORDER BY m.joined_at ASC`,
    [rideId]
  );
  const r = ride.rows[0];
  return {
    id: r.id,
    hostId: r.host_id,
    inviteCode: r.invite_code,
    status: r.status,
    createdAt: r.created_at,
    endedAt: r.ended_at,
    members: members.rows.map((m) => ({
      userId: m.user_id, name: m.name, isHost: m.user_id === r.host_id, joinedAt: m.joined_at,
    })),
  };
}

const alreadyInRide = () => new HttpError(409, 'You are already in an active group ride. Leave it first.');

async function createRide(userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (await activeRideIdOf(client, userId)) throw alreadyInRide();

    let rideId = null;
    for (let attempt = 0; attempt < 5 && !rideId; attempt++) {
      await client.query('SAVEPOINT try_code');
      try {
        const r = await client.query(
          `INSERT INTO group_rides (host_id, invite_code) VALUES ($1, $2) RETURNING id`, [userId, newCode()]
        );
        rideId = r.rows[0].id;
      } catch (err) {
        if (err.code === '23505' && String(err.constraint).includes('invite_code')) {
          await client.query('ROLLBACK TO SAVEPOINT try_code'); // code collision, try another
        } else throw err;
      }
    }
    if (!rideId) throw new HttpError(500, 'Could not generate an invite code, please try again');

    await client.query(`INSERT INTO group_ride_members (group_ride_id, user_id) VALUES ($1, $2)`, [rideId, userId]);
    await client.query('COMMIT');
    return getRide(rideId);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.constraint === 'uniq_active_membership') throw alreadyInRide();
    throw err;
  } finally {
    client.release();
  }
}

// Returns { ride, newlyJoined }
async function joinRide(userId, body = {}) {
  const code = v.text(body.inviteCode, 'inviteCode', { max: 10 }).toUpperCase();
  const found = await pool.query(`SELECT id FROM group_rides WHERE invite_code = $1 AND status = 'active'`, [code]);
  if (!found.rows[0]) throw new HttpError(404, 'No active group ride with that invite code');
  const rideId = found.rows[0].id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await activeRideIdOf(client, userId);
    if (current === rideId) {
      await client.query('COMMIT');
      return { ride: await getRide(rideId), newlyJoined: false };
    }
    if (current) throw alreadyInRide();

    const count = await client.query(
      `SELECT count(*)::int AS n FROM group_ride_members WHERE group_ride_id = $1 AND left_at IS NULL`, [rideId]
    );
    if (count.rows[0].n >= MAX_MEMBERS) throw new HttpError(409, 'This group ride is full');

    await client.query(
      `INSERT INTO group_ride_members (group_ride_id, user_id) VALUES ($1, $2)
       ON CONFLICT (group_ride_id, user_id) DO UPDATE SET left_at = NULL, joined_at = now()`,
      [rideId, userId]
    );
    await client.query('COMMIT');
    return { ride: await getRide(rideId), newlyJoined: true };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.constraint === 'uniq_active_membership') throw alreadyInRide();
    throw err;
  } finally {
    client.release();
  }
}

async function getCurrent(userId) {
  const rideId = await activeRideIdOf(pool, userId);
  return rideId ? getRide(rideId) : null;
}

async function endRideInternal(db, rideId) {
  await db.query(`UPDATE group_rides SET status = 'ended', ended_at = now() WHERE id = $1`, [rideId]);
  await db.query(`UPDATE group_ride_members SET left_at = now() WHERE group_ride_id = $1 AND left_at IS NULL`, [rideId]);
}

// A member leaves. If the host leaves, the whole ride ends. Returns { ended }
async function leaveRide(userId, rideId) {
  v.uuid(rideId, 'ride id');
  const m = await pool.query(
    `SELECT r.host_id FROM group_ride_members m JOIN group_rides r ON r.id = m.group_ride_id
     WHERE m.group_ride_id = $1 AND m.user_id = $2 AND m.left_at IS NULL AND r.status = 'active'`,
    [rideId, userId]
  );
  if (!m.rows[0]) throw new HttpError(404, 'You are not in that group ride');

  if (m.rows[0].host_id === userId) {
    await endRideInternal(pool, rideId);
    return { ended: true };
  }
  await pool.query(
    `UPDATE group_ride_members SET left_at = now() WHERE group_ride_id = $1 AND user_id = $2 AND left_at IS NULL`,
    [rideId, userId]
  );
  return { ended: false };
}

// Host ends the ride for everyone
async function endRide(userId, rideId) {
  v.uuid(rideId, 'ride id');
  const r = await pool.query(`SELECT host_id, status FROM group_rides WHERE id = $1`, [rideId]);
  if (!r.rows[0]) throw new HttpError(404, 'Group ride not found');
  if (r.rows[0].host_id !== userId) throw new HttpError(403, 'Only the host can end the group ride');
  if (r.rows[0].status === 'active') await endRideInternal(pool, rideId);
  return { ended: true };
}

module.exports = { createRide, joinRide, getCurrent, leaveRide, endRide, getRide, activeRideIdOf: (id) => activeRideIdOf(pool, id) };
