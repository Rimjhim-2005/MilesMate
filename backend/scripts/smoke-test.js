/**
 * End-to-end check of the whole backend. Start the server first (npm run dev), then: npm run smoke
 * Creates temporary users/posts (names start with "smoke-" / "[smoke]") and deletes them at the end.
 */
require('dotenv').config();
const { io } = require('socket.io-client');
const { pool } = require('../src/config/db');
const redis = require('../src/config/redis');

const BASE = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
const RUN = Date.now().toString(36);
const email = (n) => `smoke-${RUN}-${n}@example.com`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? ' -> ' + JSON.stringify(detail) : ''}`); }
}
const section = (t) => console.log(`\n${t}`);

async function api(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }
  return { status: res.status, data };
}

const EVENTS = ['nearby:location', 'nearby:location_removed', 'ride:location', 'ride:location_removed',
                'ride:member_joined', 'ride:member_left', 'ride:ended', 'location:error'];
function connect(token) {
  return new Promise((resolve, reject) => {
    const s = io(BASE, { auth: token ? { token } : {}, reconnection: false, transports: ['websocket'] });
    s.log = [];
    EVENTS.forEach((ev) => s.on(ev, (m) => s.log.push([ev, m])));
    s.on('connect', () => resolve(s));
    s.on('connect_error', (e) => { s.close(); reject(e); });
  });
}
const got = (s, ev, pred = () => true) => s.log.some(([e, m]) => e === ev && pred(m));
const count = (s, ev) => s.log.filter(([e]) => e === ev).length;

const daysAgoAt0330Z = (d) => { const x = new Date(); x.setUTCDate(x.getUTCDate() - d); x.setUTCHours(3, 30, 0, 0); return x; };

async function run() {
  const sockets = [];
  try {
    section('Basics');
    check('GET /health', (await api('GET', '/health')).data?.status === 'ok');
    const nf = await api('GET', '/api/nope');
    check('unknown route returns 404 JSON', nf.status === 404 && !!nf.data?.error);
    const bad = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
    check('invalid JSON body returns 400', bad.status === 400);

    section('Auth');
    const A = await api('POST', '/api/auth/signup', { body: { name: 'Smoke Alpha', email: email('a'), password: 'password123', vehicleInfo: 'Swift' } });
    check('signup returns 201 + token + user', A.status === 201 && typeof A.data?.token === 'string' && A.data?.user?.email === email('a'), A);
    check('signup never returns the password', !JSON.stringify(A.data).toLowerCase().includes('password'));
    const tA = A.data.token, idA = A.data.user.id;
    check('duplicate email (any case) returns 409', (await api('POST', '/api/auth/signup', { body: { name: 'x', email: email('a').toUpperCase(), password: 'password123' } })).status === 409);
    check('short password returns 400', (await api('POST', '/api/auth/signup', { body: { name: 'x', email: email('z'), password: 'short' } })).status === 400);
    check('bad email returns 400', (await api('POST', '/api/auth/signup', { body: { name: 'x', email: 'nope', password: 'password123' } })).status === 400);
    check('missing name returns 400', (await api('POST', '/api/auth/signup', { body: { email: email('z'), password: 'password123' } })).status === 400);
    const L = await api('POST', '/api/auth/login', { body: { email: email('a'), password: 'password123' } });
    check('login returns token', L.status === 200 && !!L.data?.token);
    check('wrong password returns 401', (await api('POST', '/api/auth/login', { body: { email: email('a'), password: 'wrongpass1' } })).status === 401);
    check('unknown email returns 401', (await api('POST', '/api/auth/login', { body: { email: email('none'), password: 'password123' } })).status === 401);
    const me = await api('GET', '/api/users/me', { token: tA });
    check('GET /users/me', me.status === 200 && me.data?.email === email('a') && me.data?.vehicleInfo === 'Swift', me);
    check('GET /users/me without token returns 401', (await api('GET', '/api/users/me')).status === 401);
    check('GET /users/me with bad token returns 401', (await api('GET', '/api/users/me', { token: 'garbage' })).status === 401);
    const up = await api('PUT', '/api/users/me', { token: tA, body: { vehicleInfo: 'Swift Dzire' } });
    check('PUT /users/me updates vehicleInfo', up.status === 200 && up.data?.vehicleInfo === 'Swift Dzire' && up.data?.name === 'Smoke Alpha', up);
    check('PUT /users/me with nothing returns 400', (await api('PUT', '/api/users/me', { token: tA, body: {} })).status === 400);
    const B = await api('POST', '/api/auth/signup', { body: { name: 'Smoke Beta', email: email('b'), password: 'password123' } });
    const C = await api('POST', '/api/auth/signup', { body: { name: 'Smoke Gamma', email: email('c'), password: 'password123' } });
    const tB = B.data.token, idB = B.data.user.id, tC = C.data.token, idC = C.data.user.id;

    section('Forum');
    const LAT = 20.2961, LNG = 85.8245;
    check('create post without token returns 401', (await api('POST', '/api/forum', { body: { lat: LAT, lng: LNG, body: 'x' } })).status === 401);
    const P = await api('POST', '/api/forum', { token: tA, body: { lat: LAT, lng: LNG, body: '[smoke] pothole near the flyover', category: 'Road Hazard', severity: 'High', locationLabel: 'Smoke Flyover' } });
    check('create post returns 201 + id', P.status === 201 && !!P.data?.id, P);
    const postId = P.data.id;
    const mk = (extra) => api('POST', '/api/forum', { token: tA, body: { lat: LAT, lng: LNG, body: '[smoke] x', ...extra } });
    check('invalid category returns 400', (await mk({ category: 'Pothole' })).status === 400);
    check('invalid severity returns 400', (await mk({ severity: 'Extreme' })).status === 400);
    check('missing body returns 400', (await api('POST', '/api/forum', { token: tA, body: { lat: LAT, lng: LNG } })).status === 400);
    check('latitude out of range returns 400', (await mk({ lat: 123 })).status === 400);
    const N = await api('GET', `/api/forum/nearby?lat=${LAT}&lng=${LNG}&radius=200`);
    const np = Array.isArray(N.data) ? N.data.find((p) => p.id === postId) : null;
    check('nearby finds the new post', !!np);
    check('nearby post has lat/lng, severity, comment_count, author, distance', np && typeof np.lat === 'number' && typeof np.lng === 'number' && np.severity === 'High' && np.comment_count === 0 && np.author === 'Smoke Alpha' && np.distance_m < 5, np);
    check('nearby without lat/lng returns 400', (await api('GET', '/api/forum/nearby')).status === 400);
    check('nearby with bad radius returns 400', (await api('GET', `/api/forum/nearby?lat=${LAT}&lng=${LNG}&radius=abc`)).status === 400);
    const S = await api('GET', '/api/forum/search?keyword=smoke%20pothole%20flyover');
    const sp = Array.isArray(S.data) ? S.data.find((p) => p.id === postId) : null;
    check('search by keyword finds the post, with coordinates', sp && typeof sp.lat === 'number' && typeof sp.lng === 'number', S.data);
    check('search with only lat returns 400', (await api('GET', `/api/forum/search?lat=${LAT}`)).status === 400);
    const S2 = await api('GET', `/api/forum/search?category=${encodeURIComponent('Road Hazard')}&keyword=smoke&lat=${LAT}&lng=${LNG}&radius=300`);
    check('search combines category + keyword + location', Array.isArray(S2.data) && S2.data.some((p) => p.id === postId));
    const S3 = await api('GET', '/api/forum/search?sort=top&limit=1');
    check('search sort=top&limit=1 returns 1 item', S3.status === 200 && S3.data.length === 1);
    check('search with bad sort returns 400', (await api('GET', '/api/forum/search?sort=random')).status === 400);
    check('search with limit=0 returns 400', (await api('GET', '/api/forum/search?limit=0')).status === 400);
    const G = await api('GET', `/api/forum/${postId}`);
    check('GET post by id (no comments yet)', G.status === 200 && G.data?.id === postId && Array.isArray(G.data?.comments) && G.data.comments.length === 0, G);
    check('GET post with invalid id returns 400', (await api('GET', '/api/forum/abc')).status === 400);
    check('GET unknown post returns 404', (await api('GET', '/api/forum/00000000-0000-4000-8000-000000000000')).status === 404);
    const CM = await api('POST', `/api/forum/${postId}/comments`, { token: tB, body: { body: '[smoke] seen this too' } });
    check('add comment returns 201 with author', CM.status === 201 && CM.data?.author === 'Smoke Beta', CM);
    check('empty comment returns 400', (await api('POST', `/api/forum/${postId}/comments`, { token: tB, body: { body: '  ' } })).status === 400);
    check('comment without token returns 401', (await api('POST', `/api/forum/${postId}/comments`, { body: { body: 'x' } })).status === 401);
    check('comment on unknown post returns 404', (await api('POST', '/api/forum/00000000-0000-4000-8000-000000000000/comments', { token: tB, body: { body: 'x' } })).status === 404);
    const G2 = await api('GET', `/api/forum/${postId}`);
    check('post now shows the comment and comment_count 1', G2.data?.comments?.length === 1 && G2.data?.comment_count === 1);
    const vote = (token, value) => api('POST', `/api/forum/${postId}/vote`, { token, body: { value } });
    check('upvote -> 1', (await vote(tA, 1)).data?.upvote_count === 1);
    check('same upvote again does not double count', (await vote(tA, 1)).data?.upvote_count === 1);
    check('change to downvote -> -1', (await vote(tA, -1)).data?.upvote_count === -1);
    check('remove vote -> 0', (await vote(tA, 0)).data?.upvote_count === 0);
    check('second user upvote -> 1', (await vote(tB, 1)).data?.upvote_count === 1);
    check('invalid vote value returns 400', (await vote(tA, 5)).status === 400);
    check('vote on unknown post returns 404', (await api('POST', '/api/forum/00000000-0000-4000-8000-000000000000/vote', { token: tA, body: { value: 1 } })).status === 404);

    section('Trips and dashboard (data planted in the Arabian Sea so seed data cannot interfere)');
    for (const category of ['Accident', 'Safety Concern']) {
      await api('POST', '/api/forum', { token: tA, body: { lat: 10.0, lng: 70.0, body: '[smoke] hazard', category } });
    }
    const trip = (area, startLat, startLng, km, min, money, d) => {
      const s = daysAgoAt0330Z(d);
      return api('POST', '/api/trips', { token: tA, body: { startLat, startLng, endLat: startLat + 0.01, endLng: startLng + 0.01, areaLabel: area, distanceKm: km, durationMinutes: min, moneyEarned: money, startedAt: s.toISOString(), endedAt: new Date(s.getTime() + min * 60000).toISOString() } });
    };
    const T1 = await trip('Smoke Patia', 10.0, 70.0, 10, 25, 300, 2);
    await trip('Smoke Patia', 10.0, 70.0, 12, 30, 400, 3);
    const T3 = await trip('Smoke OldTown', 11.0, 71.0, 5, 15, undefined, 5);
    await trip('Smoke OldTown', 11.0, 71.0, 8, 20, 150, 60);
    check('create trip returns 201', T1.status === 201 && T1.data?.areaLabel === 'Smoke Patia' && T1.data?.moneyEarned === 300 && T1.data?.distanceKm === 10, T1);
    check('trip without moneyEarned stores null', T3.data?.moneyEarned === null);
    check('trip without token returns 401', (await api('POST', '/api/trips', { body: {} })).status === 401);
    check('trip missing startLat returns 400', (await api('POST', '/api/trips', { token: tA, body: { startLng: 70, endLat: 1, endLng: 1, distanceKm: 1, durationMinutes: 1, startedAt: new Date().toISOString(), endedAt: new Date().toISOString() } })).status === 400);
    check('trip ending before it starts returns 400', (await api('POST', '/api/trips', { token: tA, body: { startLat: 1, startLng: 1, endLat: 1, endLng: 1, distanceKm: 1, durationMinutes: 1, startedAt: '2026-01-02T00:00:00Z', endedAt: '2026-01-01T00:00:00Z' } })).status === 400);
    check('negative distance returns 400', (await api('POST', '/api/trips', { token: tA, body: { startLat: 1, startLng: 1, endLat: 1, endLng: 1, distanceKm: -5, durationMinutes: 1, startedAt: new Date().toISOString(), endedAt: new Date().toISOString() } })).status === 400);
    const pt = await api('PATCH', `/api/trips/${T3.data.id}`, { token: tA, body: { moneyEarned: 50 } });
    check('driver adds earnings after the ride', pt.status === 200 && pt.data?.moneyEarned === 50, pt);
    check("another user cannot edit someone's trip", (await api('PATCH', `/api/trips/${T3.data.id}`, { token: tB, body: { moneyEarned: 1 } })).status === 404);
    check('PATCH without moneyEarned returns 400', (await api('PATCH', `/api/trips/${T3.data.id}`, { token: tA, body: {} })).status === 400);
    const clr = await api('PATCH', `/api/trips/${T3.data.id}`, { token: tA, body: { moneyEarned: null } });
    check('earnings can be cleared with null', clr.status === 200 && clr.data?.moneyEarned === null);
    await api('PATCH', `/api/trips/${T3.data.id}`, { token: tA, body: { moneyEarned: 50 } });
    const TL = await api('GET', '/api/trips', { token: tA });
    check('list trips returns 4, newest first', TL.status === 200 && TL.data.length === 4 && new Date(TL.data[0].startedAt) > new Date(TL.data[3].startedAt));
    const D = await api('GET', '/api/dashboard/stats', { token: tA });
    const d = D.data || {};
    check('dashboard: 3 trips in last 30 days (60-day-old one excluded)', d.trips === 3, d);
    check('dashboard: miles = 27 km x 0.621371 = 16.78', d.miles === 16.78, d.miles);
    check('dashboard: minutes = 70', d.minutes === 70, d.minutes);
    check('dashboard: earned = 750 (null counts as 0, edit applied)', d.earned === 750, d.earned);
    check('dashboard: most profitable area = Smoke Patia', d.mostProfitableArea === 'Smoke Patia', d.mostProfitableArea);
    check('dashboard: safest area = Smoke OldTown (fewer hazard reports nearby)', d.safestArea === 'Smoke OldTown', d.safestArea);
    check('dashboard: Patia hazardReportsNearby = 2', d.byArea?.find((a) => a.area === 'Smoke Patia')?.hazardReportsNearby === 2, d.byArea);
    check('dashboard: busiest hour is 9 in IST (03:30 UTC)', d.busiestHours?.[0]?.hour === 9 && d.busiestHours?.[0]?.trip_count === 3, d.busiestHours);
    const D90 = await api('GET', '/api/dashboard/stats?days=90', { token: tA });
    check('dashboard days=90 includes the older trip (4 trips, earned 900)', D90.data?.trips === 4 && D90.data?.earned === 900, D90.data);
    check('dashboard days=0 returns 400', (await api('GET', '/api/dashboard/stats?days=0', { token: tA })).status === 400);
    check('dashboard without token returns 401', (await api('GET', '/api/dashboard/stats')).status === 401);

    section('Group rides (REST)');
    const R = await api('POST', '/api/group-rides', { token: tA });
    check('create ride returns 201, 6-char code, host is the only member', R.status === 201 && R.data?.ride?.inviteCode?.length === 6 && R.data.ride.members.length === 1 && R.data.ride.members[0].isHost === true, R);
    const rideId = R.data.ride.id, code = R.data.ride.inviteCode;
    check('creating a second ride while in one returns 409', (await api('POST', '/api/group-rides', { token: tA })).status === 409);
    check('current ride for host', (await api('GET', '/api/group-rides/current', { token: tA })).data?.ride?.id === rideId);
    check('current ride is null for someone not in one', (await api('GET', '/api/group-rides/current', { token: tB })).data?.ride === null);
    check('join with unknown code returns 404', (await api('POST', '/api/group-rides/join', { token: tB, body: { inviteCode: 'ZZZZZZ' } })).status === 404);
    check('join with no code returns 400', (await api('POST', '/api/group-rides/join', { token: tB, body: {} })).status === 400);

    section('Live location and ride rooms (Socket.IO)');
    let rejected = false;
    try { (await connect(null)).close(); } catch (e) { rejected = /Authentication required/.test(e.message); }
    check('socket without token is rejected', rejected);
    rejected = false;
    try { (await connect('garbage')).close(); } catch (e) { rejected = /Invalid or expired/.test(e.message); }
    check('socket with a bad token is rejected', rejected);

    const sA = await connect(tA); sockets.push(sA);   // already in a ride: auto-joins its room on connect
    const sB = await connect(tB); sockets.push(sB);   // not in a ride yet
    const sC = await connect(tC); sockets.push(sC);   // never in a ride
    await sleep(300);

    const J = await api('POST', '/api/group-rides/join', { token: tB, body: { inviteCode: code.toLowerCase() } });
    check('join with lowercase code works, ride now has 2 members', J.status === 200 && J.data?.ride?.members?.length === 2, J);
    await sleep(300);
    check('host is told a member joined (ride:member_joined)', got(sA, 'ride:member_joined', (m) => m.userId === idB && m.name === 'Smoke Beta'));
    const J2 = await api('POST', '/api/group-rides/join', { token: tB, body: { inviteCode: code } });
    await sleep(200);
    check('joining again is harmless (still 2 members, no duplicate event)', J2.status === 200 && J2.data.ride.members.length === 2 && count(sA, 'ride:member_joined') === 1);

    // A and C ~0.45 km apart; B ~6 km from both but in A's ride
    sB.emit('location:update', { lat: 20.3500, lng: 85.8245 });
    sC.emit('location:update', { lat: 20.3000, lng: 85.8245 });
    await sleep(300);
    sA.emit('location:update', { lat: LAT, lng: LNG });
    sA.emit('location:update', { lat: 999, lng: 0 });
    await sleep(700);
    check('ride member 6 km away receives the host position (ride:location)', got(sB, 'ride:location', (m) => m.userId === idA));
    check('host receives the far ride member position', got(sA, 'ride:location', (m) => m.userId === idB));
    check('user within 1 km (not in the ride) sees the host (nearby:location)', got(sC, 'nearby:location', (m) => m.userId === idA));
    check('host sees the user within 1 km', got(sA, 'nearby:location', (m) => m.userId === idC));
    check('user 6 km away does NOT get nearby:location', !got(sB, 'nearby:location'));
    check('non-member never receives ride:location', !got(sC, 'ride:location'));
    check('invalid coordinates are rejected with location:error', got(sA, 'location:error'));
    const ttl = await redis.ttl(`live_location:${idA}`);
    check('live location is in Redis with a 15 s expiry', ttl > 0 && ttl <= 15, ttl);

    sA.emit('location:stop_sharing');
    await sleep(500);
    check('stop sharing: user who saw the marker is told to remove it', got(sC, 'nearby:location_removed', (m) => m.userId === idA));
    check('stop sharing: ride member is told (ride:location_removed)', got(sB, 'ride:location_removed', (m) => m.userId === idA));
    check('stop sharing: someone who never saw the user is NOT told', !got(sB, 'nearby:location_removed'));
    check('stop sharing: location deleted from Redis', (await redis.exists(`live_location:${idA}`)) === 0);

    const leave = await api('POST', `/api/group-rides/${rideId}/leave`, { token: tB });
    await sleep(300);
    check('member leaves the ride', leave.status === 200 && leave.data?.rideEnded === false, leave);
    check('host is told the member left', got(sA, 'ride:member_left', (m) => m.userId === idB));
    check('leaver has no current ride', (await api('GET', '/api/group-rides/current', { token: tB })).data?.ride === null);
    sB.log.length = 0;
    sA.emit('location:update', { lat: LAT, lng: LNG });
    await sleep(400);
    check('after leaving, the member no longer receives ride:location', !got(sB, 'ride:location'));
    check('non-host cannot end the ride (403)', (await api('POST', `/api/group-rides/${rideId}/end`, { token: tB })).status === 403);
    const end = await api('POST', `/api/group-rides/${rideId}/end`, { token: tA });
    await sleep(300);
    check('host ends the ride', end.status === 200 && end.data?.rideEnded === true);
    check('host receives ride:ended', got(sA, 'ride:ended', (m) => m.rideId === rideId));
    check('ended ride has no current ride', (await api('GET', '/api/group-rides/current', { token: tA })).data?.ride === null);
    check('cannot join an ended ride with its old code (404)', (await api('POST', '/api/group-rides/join', { token: tC, body: { inviteCode: code } })).status === 404);

    const R2 = await api('POST', '/api/group-rides', { token: tB });
    check('after leaving, the user can host a new ride (no stale membership)', R2.status === 201, R2);
    await api('POST', '/api/group-rides/join', { token: tC, body: { inviteCode: R2.data.ride.inviteCode } });
    const hostLeave = await api('POST', `/api/group-rides/${R2.data.ride.id}/leave`, { token: tB });
    await sleep(300);
    check('host leaving ends the ride for everyone', hostLeave.data?.rideEnded === true && got(sC, 'ride:ended'));
    check('other member has no current ride afterwards', (await api('GET', '/api/group-rides/current', { token: tC })).data?.ride === null);
  } finally {
    sockets.forEach((s) => s.close());
    await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`smoke-${RUN}-%@example.com`]);
    await pool.query(`DELETE FROM forum_posts WHERE body LIKE '[smoke]%'`);
    for (const k of await redis.keys('live_location:*')) await redis.del(k);
  }
}

run()
  .catch((err) => {
    failures.push('script crashed');
    console.error(`\nScript stopped: ${err.cause?.code === 'ECONNREFUSED' || /fetch failed/.test(err.message) ? `could not reach the server at ${BASE}. Start it first with: npm run dev` : err.stack}`);
  })
  .finally(async () => {
    console.log(`\n${passed} passed, ${failures.length} failed${failures.length ? ': ' + failures.join('; ') : ''}`);
    await pool.end();
    redis.disconnect();
    process.exit(failures.length ? 1 : 0);
  });
