// Demo data for the frontend: one driver, ~30 days of trips, a few forum tips.
// Usage: node seed-demo.mjs        (needs Node 18+ and the backend running)
//        node seed-demo.mjs --force (add more trips even if the demo user already has some)
const BASE = process.env.API_URL || 'http://localhost:5000';
const EMAIL = 'demo@milesmate.test';
const PASS = 'password123';

async function call(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// small deterministic random so reruns look the same
let seed = 42;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const between = (a, b) => a + rnd() * (b - a);

const AREAS = [
  { area: 'Patia', lat: 20.354, lng: 85.819, rate: 22 },
  { area: 'Chandrasekharpur', lat: 20.325, lng: 85.818, rate: 19 },
  { area: 'Saheed Nagar', lat: 20.296, lng: 85.848, rate: 17 },
  { area: 'Old Town', lat: 20.238, lng: 85.843, rate: 14 },
];
// trips per weekday, Sun..Sat (Sunday busiest, Tuesday quietest, like the design)
const PER_DAY = [3, 2, 1, 2, 2, 1, 2];
const HOURS_IST = [9, 9, 13, 19, 20]; // busiest around 9

const TIPS = [
  { lat: 20.354, lng: 85.819, locationLabel: 'Patia Square', category: 'Road Hazard', severity: 'High', body: 'Big pothole after the flyover exit, keep left. Lots of two-wheelers swerving here.' },
  { lat: 20.3555, lng: 85.8205, locationLabel: 'KIIT Road', category: 'Waterlogging', severity: 'Medium', body: 'Water collects near the gate after rain. Fine on a bike, risky for slow loads.' },
  { lat: 20.326, lng: 85.8185, locationLabel: 'Chandrasekharpur Main Rd', category: 'Traffic', severity: 'Medium', body: 'Jam 6 to 8pm near the signal. Take the service lane to save 10 minutes.' },
  { lat: 20.297, lng: 85.8475, locationLabel: 'Saheed Nagar Lane 3', category: 'Route Tip', severity: 'Low', body: 'Narrow lane but quick shortcut to the market. Gate guard lets bikes in without calling.' },
  { lat: 20.239, lng: 85.8435, locationLabel: 'Old Town Bus Stand', category: 'Safety Concern', severity: 'High', body: 'Poor lighting after 9pm and stray dogs near the corner. Avoid late drops here.' },
  { lat: 20.2965, lng: 85.8245, locationLabel: 'Master Canteen', category: 'Accident', severity: 'Medium', body: 'Minor accident cleared, but expect slow traffic for a while.' },
];

async function main() {
  let r = await call('POST', '/api/auth/signup', { name: 'Demo Driver', email: EMAIL, password: PASS, vehicleInfo: 'Honda Activa' });
  if (r.status === 409) r = await call('POST', '/api/auth/login', { email: EMAIL, password: PASS });
  if (!r.data.token) throw new Error(`Auth failed: ${JSON.stringify(r.data)}`);
  const token = r.data.token;

  const existing = await call('GET', '/api/trips?limit=1', null, token);
  if (existing.data.length && !process.argv.includes('--force')) {
    console.log('Demo user already has trips, skipping. Use --force to add more.');
  } else {
    let n = 0;
    for (let d = 0; d < 30; d++) {
      const day = new Date(); day.setDate(day.getDate() - d);
      for (let k = 0; k < PER_DAY[day.getDay()]; k++) {
        const a = AREAS[Math.floor(rnd() * AREAS.length)];
        const km = +between(2, 12).toFixed(1);
        const min = Math.round(km * 3 + between(3, 10));
        const start = new Date(day);
        const h = HOURS_IST[Math.floor(rnd() * HOURS_IST.length)];
        start.setUTCHours(h - 5, 30 - 0 + Math.floor(between(-20, 20)), 0, 0); // IST -> UTC
        if (start > new Date()) continue;
        const res = await call('POST', '/api/trips', {
          startLat: a.lat, startLng: a.lng, endLat: a.lat + 0.02, endLng: a.lng + 0.01,
          startAddress: a.area, areaLabel: a.area, distanceKm: km, durationMinutes: min,
          moneyEarned: Math.round(km * a.rate + between(0, 40)),
          startedAt: start.toISOString(), endedAt: new Date(start.getTime() + min * 60000).toISOString(),
        }, token);
        if (res.status === 201) n++; else console.log('trip failed', res.data);
      }
    }
    console.log(`Created ${n} trips`);
  }

  let first;
  for (const t of TIPS) {
    const res = await call('POST', '/api/forum', t, token);
    if (res.status === 201) first ||= res.data.id; else console.log('post failed', res.data);
  }
  if (first) await call('POST', `/api/forum/${first}/comments`, { body: 'Confirmed, hit it this morning.' }, token);
  console.log(`Done. Log in with ${EMAIL} / ${PASS}`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
