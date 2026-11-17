const { pool } = require('../config/db');
const v = require('../utils/validate');
const { HAZARD_CATEGORIES, HAZARD_RADIUS_METERS, KM_TO_MILES, DASHBOARD_TIMEZONE } = require('../constants');

const round = (n, places = 2) => Math.round(n * 10 ** places) / 10 ** places;

async function getStats(userId, query = {}) {
  const days = v.integer(query.days, 'days', { min: 1, max: 365, fallback: 30 });

  const [areas, hours, safety] = await Promise.all([
    pool.query(
      `SELECT area_label,
              COUNT(*)::int                       AS trips,
              COALESCE(SUM(distance_km), 0)       AS km,
              COALESCE(SUM(duration_minutes), 0)  AS minutes,
              COALESCE(SUM(money_earned), 0)      AS earned
       FROM trips
       WHERE driver_id = $1 AND started_at >= now() - make_interval(days => $2::int)
       GROUP BY area_label`,
      [userId, days]
    ),
    pool.query(
      `SELECT EXTRACT(HOUR FROM started_at AT TIME ZONE $3)::int AS hour, COUNT(*)::int AS trip_count
       FROM trips
       WHERE driver_id = $1 AND started_at >= now() - make_interval(days => $2::int)
       GROUP BY hour ORDER BY trip_count DESC, hour ASC`,
      [userId, days, DASHBOARD_TIMEZONE]
    ),
    // Average number of hazard reports within 500 m of the start of each trip, per area
    pool.query(
      `SELECT t.area_label, AVG(h.cnt) AS avg_hazards
       FROM trips t
       CROSS JOIN LATERAL (
         SELECT count(*) AS cnt FROM forum_posts p
         WHERE p.category = ANY($3::text[]) AND ST_DWithin(p.location, t.start_point, $4)
       ) h
       WHERE t.driver_id = $1 AND t.area_label IS NOT NULL
         AND t.started_at >= now() - make_interval(days => $2::int)
       GROUP BY t.area_label`,
      [userId, days, HAZARD_CATEGORIES, HAZARD_RADIUS_METERS]
    ),
  ]);

  const hazards = new Map(safety.rows.map((r) => [r.area_label, round(Number(r.avg_hazards), 1)]));
  const byArea = areas.rows.map((r) => ({
    area: r.area_label,
    trips: r.trips,
    miles: round(Number(r.km) * KM_TO_MILES),
    minutes: round(Number(r.minutes), 1),
    earned: round(Number(r.earned)),
    hazardReportsNearby: r.area_label ? hazards.get(r.area_label) ?? 0 : null,
  }));

  const totals = byArea.reduce(
    (a, r) => ({ trips: a.trips + r.trips, miles: a.miles + r.miles, minutes: a.minutes + r.minutes, earned: a.earned + r.earned }),
    { trips: 0, miles: 0, minutes: 0, earned: 0 }
  );

  const named = byArea.filter((r) => r.area);
  const mostProfitable = [...named].sort((a, b) => b.earned - a.earned || a.area.localeCompare(b.area))[0];
  // "Safest" only means something when there are at least two areas to compare
  const safest = named.length >= 2
    ? [...named].sort((a, b) => a.hazardReportsNearby - b.hazardReportsNearby || a.area.localeCompare(b.area))[0]
    : null;

  return {
    days,
    trips: totals.trips,
    miles: round(totals.miles),
    minutes: round(totals.minutes, 1),
    earned: round(totals.earned),
    busiestHours: hours.rows,
    mostProfitableArea: mostProfitable ? mostProfitable.area : null,
    safestArea: safest ? safest.area : null,
    byArea,
  };
}

module.exports = { getStats };
