// Postgres access for YouTube Research (Neon via the Vercel Marketplace).
// Airtable stays the home for the board's business data; this feature needs a real
// database because it tracks thousands of videos and their view history.
//
// Env: DATABASE_URL (set automatically by the Neon integration; POSTGRES_URL also accepted).
// Local tests can inject their own query function via globalThis.__ytQuery(text, params) -> rows.

let queryFn = null;
let schemaReady = null;

async function getQuery() {
  if (globalThis.__ytQuery) return globalThis.__ytQuery;
  if (queryFn) return queryFn;
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error("No database connected yet (DATABASE_URL missing). Add Neon Postgres to the ceo-dashboard project in Vercel.");
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(url);
  queryFn = (text, params = []) => sql.query(text, params);
  return queryFn;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS yt_channels(
     id TEXT PRIMARY KEY, title TEXT, handle TEXT, uploads TEXT, subs BIGINT, video_count INT, view_count BIGINT,
     thumb TEXT, source TEXT, added_at TIMESTAMPTZ DEFAULT now(), scanned_at TIMESTAMPTZ, baseline_at TIMESTAMPTZ)`,
  `CREATE TABLE IF NOT EXISTS yt_videos(
     id TEXT PRIMARY KEY, channel_id TEXT, title TEXT, published_at TIMESTAMPTZ, duration INT, is_short BOOLEAN,
     is_live BOOLEAN DEFAULT false, thumb TEXT, views BIGINT, likes BIGINT, comments BIGINT, last_ts TIMESTAMPTZ)`,
  `CREATE INDEX IF NOT EXISTS yt_videos_channel ON yt_videos(channel_id)`,
  `CREATE TABLE IF NOT EXISTS yt_video_snaps(
     video_id TEXT, ts TIMESTAMPTZ, views BIGINT, likes BIGINT, comments BIGINT, PRIMARY KEY(video_id, ts))`,
  `CREATE TABLE IF NOT EXISTS yt_workspaces(
     id SERIAL PRIMARY KEY, name TEXT NOT NULL, my_channel_id TEXT, niche TEXT, color TEXT, created_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS yt_workspace_channels(
     workspace_id INT, channel_id TEXT, added_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY(workspace_id, channel_id))`,
  `CREATE TABLE IF NOT EXISTS yt_saved(workspace_id INT, video_id TEXT, saved_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY(workspace_id, video_id))`,
  `CREATE TABLE IF NOT EXISTS yt_hidden(workspace_id INT, video_id TEXT, PRIMARY KEY(workspace_id, video_id))`,
  `CREATE TABLE IF NOT EXISTS yt_transcripts(video_id TEXT PRIMARY KEY, lang TEXT, text TEXT, fetched_at TIMESTAMPTZ DEFAULT now(), source TEXT)`,
  `CREATE TABLE IF NOT EXISTS yt_transcript_requests(video_id TEXT PRIMARY KEY, requested_at TIMESTAMPTZ DEFAULT now(), reason TEXT)`,
  `CREATE TABLE IF NOT EXISTS yt_productions(
     id SERIAL PRIMARY KEY, workspace_id INT, source_video_id TEXT, format TEXT, status TEXT, notes TEXT, script TEXT,
     scripted_at TIMESTAMPTZ, my_video_id TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS yt_links(
     workspace_id INT, my_video_id TEXT, original_video_id TEXT, source TEXT, created_at TIMESTAMPTZ DEFAULT now(),
     PRIMARY KEY(my_video_id, original_video_id))`,
  `CREATE TABLE IF NOT EXISTS yt_quota(day TEXT PRIMARY KEY, units INT DEFAULT 0)`,
];

export async function q(text, params = []) {
  const run = await getQuery();
  if (!schemaReady) {
    schemaReady = (async () => { for (const s of SCHEMA) await run(s); })().catch(e => { schemaReady = null; throw e; });
  }
  await schemaReady;
  return run(text, params);
}

export async function one(text, params = []) {
  const rows = await q(text, params);
  return rows[0] || null;
}

/** Bulk upsert an array of plain objects into a table via json_populate_recordset. */
export async function bulkInsert(table, rows, { conflict = "DO NOTHING" } = {}) {
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const cols = Object.keys(chunk[0]);
    const list = cols.map(c => `"${c}"`).join(",");
    await q(`INSERT INTO ${table}(${list}) SELECT ${list} FROM json_populate_recordset(null::${table}, $1::json) ON CONFLICT ${conflict}`,
      [JSON.stringify(chunk)]);
  }
}
