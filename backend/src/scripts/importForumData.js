/**
 * Loads the ML team's synthetic dataset into forum_posts and forum_comments.
 *
 * Put these two files (from their Google Drive: datasets/processed) in backend/data/:
 *   forum_posts.csv     (uses: post_id, title, text, category, severity, location_name,
 *                        latitude, longitude, created_at, expires_at, upvotes)
 *   forum_comments.csv  (uses: post_id, comment_text, created_at)
 *
 * Run: npm run import:forum-data
 * Safe to re-run: posts already imported (matched by post_id) are skipped,
 * and comments are only added for posts imported in the current run.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { pool } = require('../config/db');

const DATA_DIR = path.join(__dirname, '../../data');
const CATEGORIES = ['Traffic', 'Road Hazard', 'Accident', 'Construction',
                    'Waterlogging', 'Safety Concern', 'Route Tip', 'Normal'];
const SEVERITIES = ['Low', 'Medium', 'High'];

function readCsv(file) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(path.join(DATA_DIR, file))
      .on('error', reject)
      .pipe(csv())
      .on('data', (r) => rows.push(r))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

async function run() {
  for (const f of ['forum_posts.csv', 'forum_comments.csv']) {
    if (!fs.existsSync(path.join(DATA_DIR, f))) {
      console.error(`Missing backend/data/${f}. Copy it from the ML team's Drive first.`);
      process.exit(1);
    }
  }

  const posts = await readCsv('forum_posts.csv');
  const comments = await readCsv('forum_comments.csv');
  console.log(`Read ${posts.length} posts and ${comments.length} comments.`);

  const client = await pool.connect();
  const newPostIds = new Map(); // external_id -> uuid, only for posts inserted this run
  let skippedInvalid = 0, alreadyThere = 0, commentsAdded = 0;

  try {
    await client.query('BEGIN');

    for (const p of posts) {
      const lat = parseFloat(p.latitude);
      const lng = parseFloat(p.longitude);
      const body = (p.text || '').trim();
      if (Number.isNaN(lat) || Number.isNaN(lng) || !body ||
          !CATEGORIES.includes(p.category) || !SEVERITIES.includes(p.severity)) {
        skippedInvalid++;
        continue;
      }
      const { rows } = await client.query(
        `INSERT INTO forum_posts
           (external_id, location, location_label, category, severity, title, body,
            upvote_count, source, expires_at, created_at)
         VALUES ($1, ST_MakePoint($3, $2)::geography, $4, $5, $6, $7, $8, $9,
                 'seed_import', $10, $11)
         ON CONFLICT (external_id) DO NOTHING
         RETURNING id`,
        [p.post_id, lat, lng, p.location_name || null, p.category, p.severity,
         p.title || null, body, parseInt(p.upvotes, 10) || 0,
         p.expires_at || null, p.created_at || new Date().toISOString()]
      );
      if (rows.length) newPostIds.set(p.post_id, rows[0].id);
      else alreadyThere++;
    }

    for (const c of comments) {
      const postUuid = newPostIds.get(c.post_id);
      const text = (c.comment_text || '').trim();
      if (!postUuid || !text) continue; // post was skipped/already imported
      await client.query(
        `INSERT INTO forum_comments (post_id, body, created_at) VALUES ($1, $2, $3)`,
        [postUuid, text, c.created_at || new Date().toISOString()]
      );
      commentsAdded++;
    }

    await client.query('COMMIT');
    console.log(`Posts imported: ${newPostIds.size}, already present: ${alreadyThere}, invalid skipped: ${skippedInvalid}`);
    console.log(`Comments imported: ${commentsAdded}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Import failed, nothing was saved:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
