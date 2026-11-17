-- ============================================================
-- MilesMate - PostgreSQL + PostGIS schema
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(100) NOT NULL,
  email          VARCHAR(255) UNIQUE NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  vehicle_info   VARCHAR(255),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE connections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      VARCHAR(20) NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','accepted','blocked')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, friend_id)
);

CREATE TABLE group_rides (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invite_code  VARCHAR(10) UNIQUE NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'active'
               CHECK (status IN ('active','ended')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at     TIMESTAMPTZ
);

CREATE TABLE group_ride_members (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_ride_id  UUID NOT NULL REFERENCES group_rides(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at        TIMESTAMPTZ,
  UNIQUE (group_ride_id, user_id)
);

-- A user can be an active member of at most one group ride at a time
CREATE UNIQUE INDEX uniq_active_membership ON group_ride_members (user_id) WHERE left_at IS NULL;

-- Forum posts = location tips. Real users AND the ML team's seed dataset live here.
-- Categories match the ML model's 8 labels exactly (no translation needed).
CREATE TABLE forum_posts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id    VARCHAR(20) UNIQUE,   -- e.g. 'P00001' from the seed CSV; lets us attach its comments
  author_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  location       GEOGRAPHY(POINT, 4326) NOT NULL,
  location_label VARCHAR(255),
  category       VARCHAR(30) NOT NULL DEFAULT 'Normal'
                 CHECK (category IN ('Traffic','Road Hazard','Accident','Construction',
                                      'Waterlogging','Safety Concern','Route Tip','Normal')),
  severity       VARCHAR(10) NOT NULL DEFAULT 'Low'
                 CHECK (severity IN ('Low','Medium','High')),
  title          VARCHAR(200),
  body           TEXT NOT NULL,
  upvote_count   INTEGER NOT NULL DEFAULT 0,
  source         VARCHAR(20) NOT NULL DEFAULT 'user'
                 CHECK (source IN ('user','seed_import')),
  expires_at     TIMESTAMPTZ,          -- stored, but NOT used to hide posts by default
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_forum_posts_location ON forum_posts USING GIST (location);
CREATE INDEX idx_forum_posts_category ON forum_posts (category);

ALTER TABLE forum_posts ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,''))) STORED;
CREATE INDEX idx_forum_posts_search ON forum_posts USING GIN (search_vector);

CREATE TABLE forum_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
  author_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_forum_comments_post ON forum_comments (post_id);

CREATE TABLE post_votes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vote_value  SMALLINT NOT NULL CHECK (vote_value IN (1,-1)),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);

-- Trips: source for the dashboard's 30-day stats
CREATE TABLE trips (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_point       GEOGRAPHY(POINT, 4326) NOT NULL,
  end_point         GEOGRAPHY(POINT, 4326) NOT NULL,
  start_address     VARCHAR(255),
  end_address       VARCHAR(255),
  area_label        VARCHAR(255),
  distance_km       NUMERIC(8,2),
  duration_minutes  NUMERIC(8,2),
  money_earned      NUMERIC(10,2),   -- optional, driver adds after ride or skips
  started_at        TIMESTAMPTZ NOT NULL,
  ended_at          TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_trips_driver_date ON trips (driver_id, started_at);
CREATE INDEX idx_trips_start_point ON trips USING GIST (start_point);

-- Cache for ML-generated area summaries
CREATE TABLE tip_summaries (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_center        GEOGRAPHY(POINT, 4326) NOT NULL,
  radius_meters      INTEGER NOT NULL DEFAULT 300,
  summary_text       TEXT NOT NULL,
  source_post_count  INTEGER NOT NULL,
  generated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tip_summaries_center ON tip_summaries USING GIST (area_center);

-- Live driver location is intentionally NOT a table: it lives only in Redis
-- (key live_location:{userId}, short TTL), so "no location history" holds
-- at the schema level.
