const { pool } = require('../config/db');
const HttpError = require('../utils/httpError');
const v = require('../utils/validate');

const COLUMNS = `id,
  ST_Y(start_point::geometry) AS start_lat, ST_X(start_point::geometry) AS start_lng,
  ST_Y(end_point::geometry) AS end_lat, ST_X(end_point::geometry) AS end_lng,
  start_address, end_address, area_label, distance_km, duration_minutes, money_earned,
  started_at, ended_at`;

const shape = (r) => ({
  id: r.id,
  startLat: r.start_lat, startLng: r.start_lng,
  endLat: r.end_lat, endLng: r.end_lng,
  startAddress: r.start_address, endAddress: r.end_address, areaLabel: r.area_label,
  distanceKm: r.distance_km === null ? null : Number(r.distance_km),
  durationMinutes: r.duration_minutes === null ? null : Number(r.duration_minutes),
  moneyEarned: r.money_earned === null ? null : Number(r.money_earned),
  startedAt: r.started_at,
  endedAt: r.ended_at,
});

async function createTrip(userId, body = {}) {
  const startLat = v.lat(body.startLat, 'startLat');
  const startLng = v.lng(body.startLng, 'startLng');
  const endLat = v.lat(body.endLat, 'endLat');
  const endLng = v.lng(body.endLng, 'endLng');
  const distanceKm = v.number(body.distanceKm, 'distanceKm', { min: 0, max: 5000 });
  const durationMinutes = v.number(body.durationMinutes, 'durationMinutes', { min: 0, max: 2880 });
  const moneyEarned = v.number(body.moneyEarned, 'moneyEarned', { min: 0, max: 10000000, required: false }) ?? null;
  const startedAt = v.isoDate(body.startedAt, 'startedAt');
  const endedAt = v.isoDate(body.endedAt, 'endedAt');
  if (endedAt < startedAt) throw new HttpError(400, 'endedAt must not be before startedAt');
  const startAddress = v.text(body.startAddress, 'startAddress', { required: false }) ?? null;
  const endAddress = v.text(body.endAddress, 'endAddress', { required: false }) ?? null;
  const areaLabel = v.text(body.areaLabel, 'areaLabel', { required: false }) ?? null;

  const { rows } = await pool.query(
    `INSERT INTO trips (driver_id, start_point, end_point, start_address, end_address, area_label,
                        distance_km, duration_minutes, money_earned, started_at, ended_at)
     VALUES ($1, ST_MakePoint($3, $2)::geography, ST_MakePoint($5, $4)::geography,
             $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING ${COLUMNS}`,
    [userId, startLat, startLng, endLat, endLng, startAddress, endAddress, areaLabel,
     distanceKm, durationMinutes, moneyEarned, startedAt, endedAt]
  );
  return shape(rows[0]);
}

async function listTrips(userId, query = {}) {
  const limit = v.integer(query.limit, 'limit', { min: 1, max: 100, fallback: 20 });
  const offset = v.integer(query.offset, 'offset', { min: 0, fallback: 0 });
  const { rows } = await pool.query(
    `SELECT ${COLUMNS} FROM trips WHERE driver_id = $1 ORDER BY started_at DESC LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return rows.map(shape);
}

// The driver adds (or clears, with null) the money earned after the ride
async function setEarnings(userId, tripId, body = {}) {
  v.uuid(tripId, 'trip id');
  if (!('moneyEarned' in body)) throw new HttpError(400, 'moneyEarned is required (a number, or null to clear it)');
  const moneyEarned = body.moneyEarned === null
    ? null
    : v.number(body.moneyEarned, 'moneyEarned', { min: 0, max: 10000000 });
  const { rows } = await pool.query(
    `UPDATE trips SET money_earned = $3 WHERE id = $1 AND driver_id = $2 RETURNING ${COLUMNS}`,
    [tripId, userId, moneyEarned]
  );
  if (!rows[0]) throw new HttpError(404, 'Trip not found');
  return shape(rows[0]);
}

module.exports = { createTrip, listTrips, setEarnings };
