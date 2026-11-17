const { pool } = require('../config/db');
const HttpError = require('../utils/httpError');
const v = require('../utils/validate');
const { CATEGORIES, SEVERITIES } = require('../constants');

const POST_COLUMNS = `
  p.id, p.title, p.body, p.category, p.severity, p.upvote_count, p.created_at, p.expires_at,
  p.location_label,
  ST_Y(p.location::geometry) AS lat,
  ST_X(p.location::geometry) AS lng,
  (SELECT count(*)::int FROM forum_comments c WHERE c.post_id = p.id) AS comment_count,
  u.name AS author`;
const POST_FROM = `FROM forum_posts p LEFT JOIN users u ON u.id = p.author_id`;

// Posts near a point, nearest first (map markers, tip popups, ML input)
async function findNearby(query = {}) {
  const lat = v.lat(query.lat);
  const lng = v.lng(query.lng);
  const radius = v.integer(query.radius, 'radius', { min: 1, max: 50000, fallback: 500 });
  const { rows } = await pool.query(
    `SELECT ${POST_COLUMNS},
            ST_Distance(p.location, ST_MakePoint($2, $1)::geography) AS distance_m
     ${POST_FROM}
     WHERE ST_DWithin(p.location, ST_MakePoint($2, $1)::geography, $3)
     ORDER BY distance_m ASC
     LIMIT 50`,
    [lat, lng, radius]
  );
  return rows;
}

// Forum feed + search bar: keyword, location, category, sort, pagination
async function search(query = {}) {
  const keyword = v.text(query.keyword, 'keyword', { max: 100, required: false });
  const hasLat = query.lat !== undefined && query.lat !== '';
  const hasLng = query.lng !== undefined && query.lng !== '';
  if (hasLat !== hasLng) throw new HttpError(400, 'lat and lng must be sent together');
  const lat = hasLat ? v.lat(query.lat) : undefined;
  const lng = hasLng ? v.lng(query.lng) : undefined;
  const radius = v.integer(query.radius, 'radius', { min: 1, max: 50000, fallback: 2000 });
  const category = v.oneOf(query.category, 'category', CATEGORIES, undefined);
  const sort = v.oneOf(query.sort, 'sort', ['new', 'top'], 'new');
  const limit = v.integer(query.limit, 'limit', { min: 1, max: 50, fallback: 20 });
  const offset = v.integer(query.offset, 'offset', { min: 0, fallback: 0 });

  const params = [];
  const add = (val) => { params.push(val); return `$${params.length}`; };
  const where = [];
  if (keyword) where.push(`p.search_vector @@ plainto_tsquery('english', ${add(keyword)})`);
  if (lat !== undefined) {
    where.push(`ST_DWithin(p.location, ST_MakePoint(${add(lng)}, ${add(lat)})::geography, ${add(radius)})`);
  }
  if (category) where.push(`p.category = ${add(category)}`);

  const orderBy = sort === 'top' ? 'p.upvote_count DESC, p.created_at DESC' : 'p.created_at DESC';
  const { rows } = await pool.query(
    `SELECT ${POST_COLUMNS}
     ${POST_FROM}
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY ${orderBy}
     LIMIT ${add(limit)} OFFSET ${add(offset)}`,
    params
  );
  return rows;
}

async function getPost(id) {
  v.uuid(id, 'post id');
  const { rows } = await pool.query(`SELECT ${POST_COLUMNS} ${POST_FROM} WHERE p.id = $1`, [id]);
  if (!rows[0]) throw new HttpError(404, 'Post not found');
  const comments = await pool.query(
    `SELECT c.id, c.body, c.created_at, u.name AS author
     FROM forum_comments c LEFT JOIN users u ON u.id = c.author_id
     WHERE c.post_id = $1 ORDER BY c.created_at ASC`,
    [id]
  );
  return { ...rows[0], comments: comments.rows };
}

async function createPost(userId, body = {}) {
  const lat = v.lat(body.lat);
  const lng = v.lng(body.lng);
  const text = v.text(body.body, 'body', { max: 2000 });
  const title = v.text(body.title, 'title', { max: 200, required: false }) ?? null;
  const label = v.text(body.locationLabel ?? body.location_label, 'locationLabel', { max: 255, required: false }) ?? null;
  const category = v.oneOf(body.category, 'category', CATEGORIES, 'Normal');
  const severity = v.oneOf(body.severity, 'severity', SEVERITIES, 'Low');

  const { rows } = await pool.query(
    `INSERT INTO forum_posts (author_id, location, location_label, category, severity, title, body, source)
     VALUES ($1, ST_MakePoint($3, $2)::geography, $4, $5, $6, $7, $8, 'user')
     RETURNING id, created_at`,
    [userId, lat, lng, label, category, severity, title, text]
  );
  return rows[0];
}

async function addComment(userId, postId, body = {}) {
  v.uuid(postId, 'post id');
  const text = v.text(body.body, 'body', { max: 1000 });
  const exists = await pool.query(`SELECT 1 FROM forum_posts WHERE id = $1`, [postId]);
  if (!exists.rowCount) throw new HttpError(404, 'Post not found');
  const { rows } = await pool.query(
    `WITH c AS (
       INSERT INTO forum_comments (post_id, author_id, body) VALUES ($1, $2, $3)
       RETURNING id, body, created_at, author_id
     )
     SELECT c.id, c.body, c.created_at, u.name AS author FROM c LEFT JOIN users u ON u.id = c.author_id`,
    [postId, userId, text]
  );
  return rows[0];
}

// value: 1 (upvote), -1 (downvote), 0 (remove my vote). One vote per user per post.
async function vote(userId, postId, body = {}) {
  v.uuid(postId, 'post id');
  const value = body.value;
  if (![1, -1, 0].includes(value)) throw new HttpError(400, 'value must be 1, -1 or 0');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const post = await client.query(`SELECT upvote_count FROM forum_posts WHERE id = $1 FOR UPDATE`, [postId]);
    if (!post.rowCount) throw new HttpError(404, 'Post not found');

    const prev = await client.query(`SELECT vote_value FROM post_votes WHERE post_id = $1 AND user_id = $2`, [postId, userId]);
    const prevValue = prev.rowCount ? prev.rows[0].vote_value : 0;

    if (value === 0) {
      await client.query(`DELETE FROM post_votes WHERE post_id = $1 AND user_id = $2`, [postId, userId]);
    } else {
      await client.query(
        `INSERT INTO post_votes (post_id, user_id, vote_value) VALUES ($1, $2, $3)
         ON CONFLICT (post_id, user_id) DO UPDATE SET vote_value = EXCLUDED.vote_value`,
        [postId, userId, value]
      );
    }
    // Adjust the stored count by the change, so seeded counts are preserved
    const updated = await client.query(
      `UPDATE forum_posts SET upvote_count = upvote_count + $2 WHERE id = $1 RETURNING upvote_count`,
      [postId, value - prevValue]
    );
    await client.query('COMMIT');
    return { upvote_count: updated.rows[0].upvote_count, user_vote: value };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { findNearby, search, getPost, createPost, addComment, vote };
