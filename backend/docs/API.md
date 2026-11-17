# MilesMate Backend API

Version 1.0 · 17 Nov 2026

Everything below is built and tested. Example values are illustrative.

## Changes since version 0.1

Breaking change (Socket.IO):

- Sockets now need the login token: `io(url, { auth: { token } })`. Without a valid token the connection is refused.
- The `auth:register` event is gone, and no socket event carries a `userId` any more. The server knows who you are from the token.
- `ride:join` and `ride:leave` are gone. The server puts you in and out of your ride's room when you create, join or leave a ride over REST.
- `location:stop_sharing` takes no payload.

Added: signup and login, profile, trips, group rides, forum comments and votes, get one post, forum feed options (sort, category, paging).

Changed:

- Post lists now include `lat`, `lng`, `comment_count` and `author`. Existing fields are unchanged.
- Dashboard busiest hours are in IST, numbers are rounded, and there is a new `safestArea`.
- `POST /api/forum` also accepts `location_label`.

## Basics

- Base URL (local): `http://localhost:5000`
- Format: JSON. Send `Content-Type: application/json` on POST, PUT and PATCH.
- IDs are UUID strings. Dates are ISO 8601 in UTC, e.g. `2026-11-16T07:55:07.191Z`.
- Auth: protected routes need `Authorization: Bearer <token>`. Tokens come from signup or login and last 7 days. On a 401, send the user back to login.
- CORS is open to all origins in development, so the Vite dev server can call the API directly.
- Errors are always `{ "error": "message" }` with status 400 (bad input), 401 (not logged in or bad token), 403 (not allowed), 404 (not found), 409 (conflict) or 500 (server error).
- Naming: forum post objects use snake_case (`upvote_count`). Every other endpoint uses camelCase (`vehicleInfo`). The examples below are the contract.

## Allowed values (exact spelling, case-sensitive)

- Category: Traffic, Road Hazard, Accident, Construction, Waterlogging, Safety Concern, Route Tip, Normal
- Severity: Low, Medium, High

## Auth and profile

### POST /api/auth/signup

Body: `name` (required, up to 100 characters), `email` (required), `password` (required, 8 to 72 characters), `vehicleInfo` (optional).

Response 201:

```json
{
  "token": "eyJhbGciOi...",
  "user": { "id": "5f0c...", "name": "Test Driver", "email": "driver@example.com", "vehicleInfo": "Swift Dzire", "createdAt": "2026-11-16T07:55:07.191Z" }
}
```

Errors: 400 for invalid input, 409 if the email is already registered (email is case-insensitive).

### POST /api/auth/login

Body: `email`, `password`. Response 200: same as signup. Wrong email or password returns 401 with the same message for both.

### GET /api/users/me (login required)

Returns the user object shown above.

### PUT /api/users/me (login required)

Body: `name` and/or `vehicleInfo` (send `null` or an empty string to clear the vehicle). Response 200: the updated user object. Sending neither returns 400.

## Forum

Post object, returned by the list endpoints:

```json
{
  "id": "dff911aa-74e9-4693-8572-66f542d68b6c",
  "title": "Potholes reported near Janpath",
  "body": "Several potholes are present on the road near Janpath.",
  "category": "Road Hazard",
  "severity": "High",
  "upvote_count": 12,
  "created_at": "2026-11-10T07:55:07.191Z",
  "expires_at": "2026-12-10T07:55:07.191Z",
  "location_label": "Janpath",
  "lat": 20.2701,
  "lng": 85.8302,
  "comment_count": 3,
  "author": "Test Driver"
}
```

`author` is the display name from signup, or `null` for the seeded dataset. `title`, `location_label` and `expires_at` can be `null`. Expired posts are still returned, so use `expires_at` if you want to dim or hide them.

### GET /api/forum/nearby

Posts near a point, for map markers and the tip popup. Nearest first, at most 50. Each item is a post object plus `distance_m` (metres from the point).

Query: `lat` and `lng` (required), `radius` (metres, 1 to 50000, default 500).

Example: `/api/forum/nearby?lat=20.2961&lng=85.8245&radius=1000`

### GET /api/forum/search

The forum home feed and search bar. Returns an array of post objects.

Query (all optional):

- `keyword`: searches title and body (up to 100 characters)
- `lat` and `lng`: send both or neither. `radius` in metres, default 2000
- `category`: one of the allowed categories
- `sort`: `new` (default) or `top`
- `limit`: 1 to 50, default 20. `offset`: default 0, for paging

With no query at all it returns the 20 newest posts.

### GET /api/forum/:id

One post plus its comments, oldest first:

```json
{
  "id": "dff911aa-...", "title": "...", "body": "...", "category": "Road Hazard", "severity": "High",
  "upvote_count": 12, "created_at": "...", "expires_at": "...", "location_label": "Janpath",
  "lat": 20.2701, "lng": 85.8302, "comment_count": 1, "author": "Test Driver",
  "comments": [ { "id": "a1b2...", "body": "Confirmed, I hit it this morning.", "created_at": "...", "author": "Second Driver" } ]
}
```

An invalid id returns 400, an unknown id returns 404.

### POST /api/forum (login required)

Create a post. This is also how the post-ride comment is saved.

Body: `lat`, `lng`, `body` (up to 2000 characters) are required. Optional: `category` (default Normal), `severity` (default Low), `title` (up to 200), `locationLabel` (up to 255).

```json
{ "lat": 20.27, "lng": 85.83, "body": "Big pothole near the flyover exit", "category": "Road Hazard", "severity": "High", "locationLabel": "Flyover exit" }
```

Response 201: `{ "id": "...", "created_at": "..." }`. An invalid category or severity returns 400 and lists the allowed values.

### POST /api/forum/:id/comments (login required)

Body: `{ "body": "..." }` (up to 1000 characters). Response 201: `{ "id": "...", "body": "...", "created_at": "...", "author": "Second Driver" }`.

### POST /api/forum/:id/vote (login required)

Body: `{ "value": 1 }`. Use 1 to upvote, -1 to downvote and 0 to remove your vote (it must be a number, not a string). One vote per user per post, so repeating a vote does not count twice. Response 200: `{ "upvote_count": 13, "user_vote": 1 }`.

## Trips (login required)

Trip object:

```json
{
  "id": "265986dd-...", "startLat": 20.2961, "startLng": 85.8245, "endLat": 20.35, "endLng": 85.83,
  "startAddress": "Master Canteen", "endAddress": "Patia", "areaLabel": "Patia",
  "distanceKm": 8.4, "durationMinutes": 25, "moneyEarned": null,
  "startedAt": "2026-11-16T07:30:00.000Z", "endedAt": "2026-11-16T07:55:00.000Z"
}
```

### POST /api/trips

Log a completed ride. Required: `startLat`, `startLng`, `endLat`, `endLng`, `distanceKm` (0 to 5000), `durationMinutes` (0 to 2880), `startedAt`, `endedAt` (`endedAt` must not be before `startedAt`). Optional: `moneyEarned`, `startAddress`, `endAddress`, `areaLabel`. Response 201: the trip object.

`areaLabel` is the neighbourhood name (for example from Nominatim reverse geocoding). The dashboard groups trips by it, so trips without one are counted in the totals but not in the area results.

Suggested post-ride flow:

1. When the ride ends, call `POST /api/trips`. Include `moneyEarned` if the driver typed it.
2. Show the "leave a tip" prompt. If the driver writes one, call `POST /api/forum`. If they skip, do nothing.
3. If the driver adds the earnings later, call `PATCH /api/trips/:id`.

### GET /api/trips

The driver's own trips, newest first. Query: `limit` (1 to 100, default 20), `offset`. Response: an array of trip objects.

### PATCH /api/trips/:id

Body: `{ "moneyEarned": 350 }`, or `{ "moneyEarned": null }` to clear it. Response 200: the trip object. Returns 404 for a trip that is not yours.

## Dashboard

### GET /api/dashboard/stats (login required)

Stats for the last `days` days (1 to 365, default 30).

```json
{
  "days": 30,
  "trips": 3,
  "miles": 16.78,
  "minutes": 70,
  "earned": 750,
  "busiestHours": [ { "hour": 9, "trip_count": 3 } ],
  "mostProfitableArea": "Patia",
  "safestArea": "Old Town",
  "byArea": [
    { "area": "Patia", "trips": 2, "miles": 13.67, "minutes": 55, "earned": 700, "hazardReportsNearby": 2 },
    { "area": "Old Town", "trips": 1, "miles": 3.11, "minutes": 15, "earned": 50, "hazardReportsNearby": 0 }
  ]
}
```

- `miles` is converted from kilometres. A trip with no `moneyEarned` counts as 0.
- `busiestHours` is busiest first, with `hour` in IST (0 to 23).
- `mostProfitableArea`: the named area with the highest earnings, or `null`.
- `safestArea`: the area with the fewest hazard reports near its trips. Hazard reports are posts in the categories Accident, Road Hazard and Safety Concern within 500 m of a trip's start. `hazardReportsNearby` is that count averaged per trip. `safestArea` is `null` unless there are trips in at least two areas.
- This is plain SQL aggregation, not machine learning.

## Group rides (login required)

Ride object:

```json
{
  "id": "9b2dfa4f-...", "hostId": "5f0c...", "inviteCode": "K7M2QX", "status": "active",
  "createdAt": "2026-11-16T07:55:07.191Z", "endedAt": null,
  "members": [ { "userId": "5f0c...", "name": "Test Driver", "isHost": true, "joinedAt": "2026-11-16T07:55:07.191Z" } ]
}
```

Rules: a user can be in only one active ride at a time, a ride holds up to 20 members, invite codes are 6 characters and case-insensitive, and when the host leaves the ride ends for everyone.

- `POST /api/group-rides`: create a ride and become its host. Response 201: `{ "ride": { ... } }`. Returns 409 if you are already in a ride.
- `POST /api/group-rides/join`: body `{ "inviteCode": "k7m2qx" }`. Response 200: `{ "ride": { ... } }`. Returns 404 for an unknown or ended ride, 409 if you are in another ride or this one is full. Joining a ride you are already in is harmless.
- `GET /api/group-rides/current`: `{ "ride": { ... } }`, or `{ "ride": null }` if you are not in one. Use this to get member names.
- `POST /api/group-rides/:id/leave`: response `{ "left": true, "rideEnded": false }`. `rideEnded` is true when the leaver was the host.
- `POST /api/group-rides/:id/end`: host only (403 otherwise). Response `{ "rideEnded": true }`.

## Real-time location (Socket.IO)

Connect to the base URL with the login token:

```js
import { io } from "socket.io-client";

const socket = io("http://localhost:5000", { auth: { token } });

socket.on("connect_error", (err) => {
  // err.message is "Authentication required" or "Invalid or expired token"
});

// While the user is sharing, send a position every 3 to 5 seconds
setInterval(() => socket.emit("location:update", { lat, lng }), 4000);

socket.on("nearby:location", ({ userId, lat, lng }) => { /* add or move that marker */ });
socket.on("nearby:location_removed", ({ userId }) => { /* remove that marker */ });
socket.on("ride:location", ({ userId, lat, lng }) => { /* ride member marker */ });
```

Client sends:

- `location:update` with `{ lat, lng }`. Sending updates is what "sharing" means. A user who is not sending updates is invisible.
- `location:stop_sharing` with no payload, when the user turns sharing off. Closing the connection does the same.

Client receives:

- `nearby:location` with `{ userId, lat, lng }`: another sharing user within 1 km.
- `nearby:location_removed` with `{ userId }`: remove that marker. Only sent to people who had seen that user.
- `ride:location` with `{ userId, lat, lng }`: a member of your group ride, at any distance.
- `ride:location_removed` with `{ userId }`: a ride member stopped sharing.
- `ride:member_joined` with `{ rideId, userId, name }`, `ride:member_left` with `{ rideId, userId }`, `ride:ended` with `{ rideId }`: ride changes. After `ride:ended` the socket no longer gets that ride's events.
- `location:error` with `{ message }`: the last update had invalid coordinates.

Good to know:

- Ride rooms are managed by the server. After you create or join a ride over REST, your sockets start receiving its events. After a reconnect you are put back in your active ride automatically.
- Positions expire on the server after 15 seconds without an update. Also drop markers that have not updated for about 20 seconds, which covers a user moving out of the 1 km range.
- A ride member who is also within 1 km can trigger both `nearby:location` and `ride:location` for the same user, so key your markers by `userId`.
- `userId` values are anonymous ids. For names of ride members use `GET /api/group-rides/current`.
- No location history is stored anywhere. Live positions exist only in memory and are deleted when sharing stops.

## Not available yet

- The ML tip summary for a location (it depends on the ML team's service). It will be added to this document when it exists.
