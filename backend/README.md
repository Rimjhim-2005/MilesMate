# MilesMate Backend

Express + Socket.IO + PostgreSQL/PostGIS + Redis. Full API reference: `docs/API.md`.

## What you need
- Docker Desktop (running)
- Node.js 18 or newer
- Postman (optional, for manual testing)

## First-time setup (Windows PowerShell)

1. Start the database and Redis in Docker (run once, from any folder):
   ```
   docker run --name milesmate-postgres -e POSTGRES_PASSWORD=password -e POSTGRES_DB=milesmate -p 5432:5432 -d postgis/postgis:16-3.4
   docker run --name milesmate-redis -p 6379:6379 -d redis:alpine
   ```
2. From this `backend` folder, create the tables:
   ```
   docker cp schema.sql milesmate-postgres:/schema.sql
   docker exec -it milesmate-postgres psql -U postgres -d milesmate -f /schema.sql
   ```
   You should see a list of CREATE TABLE / CREATE INDEX lines and no errors.
3. Create your settings file and install packages:
   ```
   copy .env.example .env
   npm install
   ```
4. Start the server:
   ```
   npm run dev
   ```
   You should see `MilesMate backend running on port 5000`. Open http://localhost:5000/health and expect `{"status":"ok"}`.

### Already loaded an older schema?
The schema changed, so reset the database and load it again:
```
docker exec -it milesmate-postgres psql -U postgres -c "DROP DATABASE milesmate;"
docker exec -it milesmate-postgres psql -U postgres -c "CREATE DATABASE milesmate;"
docker cp schema.sql milesmate-postgres:/schema.sql
docker exec -it milesmate-postgres psql -U postgres -d milesmate -f /schema.sql
```
This deletes all data in the database.

## Every day after that
```
docker start milesmate-postgres milesmate-redis
npm run dev
```
Never run `docker rm` on the Postgres container unless you want to wipe the data.

## Testing

**Automatic check of everything** (server must be running in another terminal):
```
npm run smoke
```
It runs 100+ checks across login, forum, trips, dashboard maths, group rides and the live sockets, prints PASS or FAIL for each, and deletes the temporary users and posts it created. It never touches your real data.

**Postman:** import `docs/MilesMate.postman_collection.json`, then right-click the collection and choose Run. Run the folders in order: signup saves the login tokens automatically. The base URL is the collection variable `baseUrl` (default http://localhost:5000). Live location uses Socket.IO, so it is covered by `npm run smoke` and described in `docs/API.md`, not in Postman.

## Loading the ML team's dataset
1. Copy their two CSV files into `backend/data/` and name them exactly `forum_posts.csv` and `forum_comments.csv`.
2. Run `npm run import:forum-data`.

Posts are matched by their `post_id`, so it is safe to run twice. Invalid rows (unknown category, missing coordinates) are skipped and counted in the summary. CSV files are gitignored, so share them with teammates outside git.

## Settings (.env)
- `DATABASE_URL`: Postgres connection string
- `REDIS_URL`: Redis connection string
- `JWT_SECRET`: any long random string, used to sign login tokens
- `PORT`: default 5000
- `JWT_EXPIRES_IN`: optional, default 7d

## Folder structure
```
backend/
├── schema.sql              all tables and indexes
├── docs/                   API.md and the Postman collection
├── scripts/smoke-test.js   the automatic check (npm run smoke)
├── data/                   put the ML team's CSV files here
└── src/
    ├── server.js           starts HTTP + Socket.IO, checks login tokens on sockets
    ├── app.js              routes and the central error handler
    ├── config/             env, Postgres and Redis connections
    ├── routes/             URL -> controller
    ├── controllers/        read the request, call a service, send the response
    ├── services/           all the logic and SQL
    ├── sockets/            live location and group ride rooms
    ├── middleware/         login token check
    ├── utils/              validation helpers, error class
    └── scripts/            CSV import
```

## Troubleshooting
- `Missing environment variables`: you have not created `.env`. Run `copy .env.example .env`.
- `port is already allocated` when starting Docker: something else uses that port. Change the left number, e.g. `-p 5433:5432`, and update `DATABASE_URL` to match.
- `ECONNREFUSED` on 5432 or 6379: the containers are not running. Run `docker start milesmate-postgres milesmate-redis`.
- Postman requests return 401: run Signup or Login first so `{{token}}` is saved.
