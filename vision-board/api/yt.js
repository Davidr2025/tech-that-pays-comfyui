// YouTube Research API: one function, routed by ?r=/path (keeps vercel.json untouched).
// Signed-in browser sessions can use every route. The content machine on David's PC uses
// Authorization: Bearer <CONTENT_MACHINE_TOKEN>, which is limited to the routes in TOKEN_ROUTES.
import { requestIsAuthed } from "../lib/auth.js";
import { q, one, bulkInsert } from "../lib/yt/db.js";
import {
  QuotaError, quotaToday, resolveChannel, fetchChannels, refreshChannels, searchYouTube, ensureVideo, getTranscript, paragraphs,
} from "../lib/yt/youtube.js";
import { compute, topicTable, videoStats, myVideos, titleDiff, scriptStats, shingleSimilarity, diagnose, growthFraction } from "../lib/yt/engine.js";

const COLORS = ["#e8590c", "#1971c2", "#2f9e44", "#9c36b5", "#c2255c", "#0c8599", "#f08c00", "#5f3dc4", "#364fc7", "#087f5b"];
const STATUSES = ["queued", "scripted", "in_production", "published"];
const TOKEN_ROUTES = [/^GET \/production(\/\d+)?$/, /^POST \/production\/\d+\/script$/, /^GET \/transcript-requests$/,
  /^POST \/transcripts$/, /^POST \/import$/, /^GET \/state$/];

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

async function isTokenAuthed(request) {
  const want = process.env.CONTENT_MACHINE_TOKEN;
  const got = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return !!want && got.length === want.length && got === want;
}

async function handle(request) {
  const url = new URL(request.url);
  const path = url.searchParams.get("r") || "/";
  const method = request.method;
  const sig = `${method} ${path}`;
  if (!(await requestIsAuthed(request, process.env.SESSION_SECRET))) {
    if (!(await isTokenAuthed(request)) || !TOKEN_ROUTES.some(re => re.test(sig))) return json({ error: "Not signed in" }, 401);
  }
  const body = ["POST", "PATCH"].includes(method) ? await request.json().catch(() => ({})) : {};
  const p = url.searchParams;
  for (const [m, re, fn] of ROUTES) {
    if (m !== method) continue;
    const match = re.exec(path);
    if (!match) continue;
    try { return json(await fn(match, p, body)); }
    catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, code: e.code }, e.status);
      if (e instanceof QuotaError) return json({ error: e.message }, 429);
      console.error(e);
      return json({ error: `${e.name}: ${e.message}` }, 500);
    }
  }
  return json({ error: "Not found" }, 404);
}

// ------------------------------------------------------------------ helpers
async function wsOr404(id) {
  const w = await one(`SELECT * FROM yt_workspaces WHERE id=$1`, [id]);
  if (!w) throw new HttpError(404, "Workspace not found");
  return w;
}
const wsChannelIds = async id => (await q(`SELECT channel_id FROM yt_workspace_channels WHERE workspace_id=$1`, [id])).map(r => r.channel_id);
async function linkChannels(wsId, ids) {
  if (ids.length) await bulkInsert("yt_workspace_channels", ids.map(c => ({ workspace_id: wsId, channel_id: c })));
}
async function resolveMine(ref) {
  if (!ref) return null;
  const id = await resolveChannel(ref);
  if (!id) throw new HttpError(400, `Couldn't find a YouTube channel for "${ref}"`);
  await fetchChannels([id], "mine");
  return id;
}
async function neverScanned(ids) {
  if (!ids.length) return [];
  return (await q(`SELECT id FROM yt_channels WHERE id = ANY($1) AND scanned_at IS NULL`, [ids])).map(r => r.id);
}

// ------------------------------------------------------------------ workspaces + channels
async function state() {
  const ws = await q(`SELECT w.*, c.title AS mc_title, c.handle AS mc_handle, c.subs AS mc_subs, c.thumb AS mc_thumb,
      (SELECT COUNT(*) FROM yt_workspace_channels x WHERE x.workspace_id=w.id)::int AS channel_count,
      (SELECT COUNT(*) FROM yt_saved s WHERE s.workspace_id=w.id)::int AS saved_count,
      (SELECT MAX(ch.scanned_at) FROM yt_channels ch JOIN yt_workspace_channels x ON x.channel_id=ch.id WHERE x.workspace_id=w.id) AS last_scan
    FROM yt_workspaces w LEFT JOIN yt_channels c ON c.id=w.my_channel_id ORDER BY w.id`);
  const queued = await one(`SELECT COUNT(*)::int AS n FROM yt_productions WHERE status='queued'`);
  const pending = await one(`SELECT COUNT(*)::int AS n FROM yt_transcript_requests`);
  return {
    workspaces: ws.map(w => ({
      id: w.id, name: w.name, niche: w.niche, color: w.color, channel_count: w.channel_count, saved_count: w.saved_count, last_scan: w.last_scan,
      my_channel: w.my_channel_id ? { id: w.my_channel_id, title: w.mc_title, handle: w.mc_handle, subs: w.mc_subs != null ? +w.mc_subs : null, thumb: w.mc_thumb } : null,
    })),
    quota: { used: await quotaToday(), limit: 10000 }, queued_scripts: queued.n, pending_transcripts: pending.n,
  };
}

async function createWs(b) {
  const name = (b.name || "").trim();
  if (!name) throw new HttpError(400, "Give the workspace a name");
  const mine = await resolveMine((b.my_channel || "").trim());
  const n = (await one(`SELECT COUNT(*)::int AS n FROM yt_workspaces`)).n;
  const r = await one(`INSERT INTO yt_workspaces(name, my_channel_id, niche, color) VALUES($1,$2,$3,$4) RETURNING id`,
    [name, mine, (b.niche || "").trim(), COLORS[n % COLORS.length]]);
  return { id: r.id, refresh: await neverScanned(mine ? [mine] : []) };
}

async function updateWs(id, b) {
  const w = await wsOr404(id);
  let mine = w.my_channel_id;
  if ("my_channel" in b) { const ref = (b.my_channel || "").trim(); mine = ref ? await resolveMine(ref) : null; }
  await q(`UPDATE yt_workspaces SET name=$1, niche=$2, my_channel_id=$3 WHERE id=$4`,
    [(b.name || w.name).trim(), b.niche ?? w.niche, mine, id]);
  return { ok: true, refresh: await neverScanned(mine ? [mine] : []) };
}

async function deleteWs(id) {
  for (const t of ["yt_workspace_channels", "yt_saved", "yt_hidden", "yt_links", "yt_productions"]) await q(`DELETE FROM ${t} WHERE workspace_id=$1`, [id]);
  await q(`DELETE FROM yt_workspaces WHERE id=$1`, [id]);
  return { ok: true };
}

async function listChannels(id) {
  await wsOr404(id);
  const rows = await q(`SELECT c.*, wc.added_at AS linked_at FROM yt_channels c JOIN yt_workspace_channels wc ON wc.channel_id=c.id
                        WHERE wc.workspace_id=$1 ORDER BY c.subs DESC NULLS LAST`, [id]);
  const stats = await q(`SELECT channel_id, COUNT(*)::int AS n,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY views) FILTER (WHERE NOT is_short AND published_at < now() - interval '7 days'
          AND NOT (views >= 10000 AND likes * 1000.0 / NULLIF(views,0) < 0.5)) AS med
      FROM yt_videos WHERE channel_id = ANY($1) AND NOT is_live GROUP BY channel_id`, [rows.map(r => r.id)]);
  const by = Object.fromEntries(stats.map(s => [s.channel_id, s]));
  return {
    channels: rows.map(c => ({
      id: c.id, title: c.title, handle: c.handle, thumb: c.thumb, subs: c.subs != null ? +c.subs : null, video_count: c.video_count,
      tracked_videos: by[c.id]?.n || 0, median_views: by[c.id]?.med != null ? Math.round(by[c.id].med) : null,
      scanned_at: c.scanned_at, linked_at: c.linked_at,
    })),
  };
}

async function addChannels(id, b) {
  await wsOr404(id);
  let refs = b.refs || [];
  if (typeof refs === "string") refs = refs.split(/\r?\n/);
  refs = refs.map(r => r.trim()).filter(Boolean);
  if (!refs.length) throw new HttpError(400, "Paste at least one channel link or @handle");
  const ids = [], failed = [];
  for (const r of refs) { const cid = await resolveChannel(r); cid ? ids.push(cid) : failed.push(r); }
  if (ids.length) { await fetchChannels(ids, "manual"); await linkChannels(id, ids); }
  return { added: ids.length, failed, refresh: await neverScanned(ids) };
}

async function discover(id, b) {
  await wsOr404(id);
  const query = (b.query || "").trim();
  if (!query) throw new HttpError(400, "Type a topic to search for");
  const before = new Set(await wsChannelIds(id));
  const { channelIds } = await searchYouTube(query, +b.days || 30, b.format || "both");
  await linkChannels(id, channelIds);
  const fresh = channelIds.filter(c => !before.has(c));
  return { found: channelIds.length, added: fresh.length, refresh: fresh };
}

async function refreshPlan(id) {
  const w = await wsOr404(id);
  const ids = await wsChannelIds(id);
  if (w.my_channel_id) ids.push(w.my_channel_id);
  return { channel_ids: [...new Set(ids)] };
}

// ------------------------------------------------------------------ videos, topics, flags
async function videos(id, p) {
  await wsOr404(id);
  const vids = await compute(await wsChannelIds(id), +(p.get("days") || 90));
  const saved = new Set((await q(`SELECT video_id FROM yt_saved WHERE workspace_id=$1`, [id])).map(r => r.video_id));
  const hidden = new Set((await q(`SELECT video_id FROM yt_hidden WHERE workspace_id=$1`, [id])).map(r => r.video_id));
  for (const v of vids) { v.saved = saved.has(v.id); v.hidden = hidden.has(v.id); }
  const ids = vids.map(v => v.id);
  const has = ids.length ? (await q(`SELECT video_id FROM yt_transcripts WHERE video_id = ANY($1)`, [ids])).map(r => r.video_id) : [];
  return { videos: vids, has_transcript: has };
}

async function topics(id, p) {
  const vids = (await compute(await wsChannelIds(id), +(p.get("days") || 30))).filter(v => !v.is_short && v.median_views >= 200);
  return { topics: topicTable(vids, 3, 40) };
}

async function toggle(id, table, b, on) {
  if (!b.video_id) throw new HttpError(400, "video_id missing");
  if (on) await q(`INSERT INTO ${table}(workspace_id, video_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, [id, b.video_id]);
  else await q(`DELETE FROM ${table} WHERE workspace_id=$1 AND video_id=$2`, [id, b.video_id]);
  return { ok: true };
}

async function transcript(vid) {
  try {
    const t = await getTranscript(vid);
    const v = await one(`SELECT v.title, c.title AS ch FROM yt_videos v LEFT JOIN yt_channels c ON c.id=v.channel_id WHERE v.id=$1`, [vid]);
    return { ...t, title: v?.title || vid, channel: v?.ch || "", url: `https://www.youtube.com/watch?v=${vid}` };
  } catch (e) {
    const err = new HttpError(e.code === "blocked" ? 202 : 404, e.message); err.code = e.code; throw err;
  }
}

// ------------------------------------------------------------------ my videos + compare
async function myVideosRoute(id) {
  const w = await wsOr404(id);
  if (!w.my_channel_id) return { linked: false };
  const ch = await one(`SELECT scanned_at FROM yt_channels WHERE id=$1`, [w.my_channel_id]);
  if (!ch?.scanned_at) return { linked: true, refresh: [w.my_channel_id], videos: [], summary: null };
  return { linked: true, ...(await myVideos(id, w.my_channel_id)) };
}

async function compare(p) {
  const m = await videoStats(p.get("mine")), o = await videoStats(p.get("orig"));
  if (!m || !o) throw new HttpError(404, "One of the videos isn't in the database yet");
  const oAtMyAge = m.age_days < o.age_days ? Math.round(o.views * growthFraction(m.age_days) / growthFraction(o.age_days)) : o.views;
  const title = titleDiff(m.title, o.title);
  let script = null;
  if (p.get("scripts") === "1") {
    script = {};
    const texts = {};
    for (const [k, v] of [["mine", m], ["original", o]]) {
      try { texts[k] = (await getTranscript(v.id)).text; script[k] = scriptStats(texts[k], v.duration); }
      catch (e) { script[k] = { error: e.message }; }
    }
    if (texts.mine && texts.original) script.similarity = Math.round(shingleSimilarity(texts.mine, texts.original) * 100) / 100;
  }
  return { mine: m, original: o, original_views_at_my_age: oAtMyAge, title, script, ...diagnose(m, o, title, script) };
}

async function link(id, b, on) {
  const w = await wsOr404(id);
  const mine = await ensureVideo(b.mine), orig = await ensureVideo(b.original);
  if (!mine || !orig) throw new HttpError(400, "Couldn't find one of those videos. Paste a full YouTube link.");
  if (on) {
    const v = await one(`SELECT channel_id FROM yt_videos WHERE id=$1`, [mine]);
    if (w.my_channel_id && v.channel_id !== w.my_channel_id) throw new HttpError(400, "That first video isn't from your channel");
    await q(`INSERT INTO yt_links(workspace_id, my_video_id, original_video_id, source) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [id, mine, orig, b.source || "manual"]);
  } else await q(`DELETE FROM yt_links WHERE my_video_id=$1 AND original_video_id=$2`, [mine, orig]);
  return { ok: true, mine, original: orig };
}

// ------------------------------------------------------------------ production queue
async function productionRow(pr, full = false) {
  const s = pr.source_video_id ? await videoStats(pr.source_video_id) : null;
  const w = await one(`SELECT name, niche, my_channel_id FROM yt_workspaces WHERE id=$1`, [pr.workspace_id]);
  const d = { ...pr, workspace: w };
  d.source = s ? { id: s.id, title: s.title, thumb: s.thumb, channel: s.channel, views: s.views, multiplier: s.multiplier, duration: s.duration, url: s.url } : null;
  if (!full) { d.script_preview = (pr.script || "").slice(0, 240); delete d.script; }
  if (pr.my_video_id) {
    const mv = await videoStats(pr.my_video_id);
    d.my_video = mv ? { id: mv.id, title: mv.title, thumb: mv.thumb, views: mv.views, age_days: mv.age_days, url: mv.url } : null;
  }
  return d;
}

async function productions(p) {
  const conds = [], args = [];
  if (p.get("status")) { args.push(p.get("status")); conds.push(`status=$${args.length}`); }
  if (p.get("workspace")) { args.push(+p.get("workspace")); conds.push(`workspace_id=$${args.length}`); }
  const rows = await q(`SELECT * FROM yt_productions ${conds.length ? "WHERE " + conds.join(" AND ") : ""} ORDER BY created_at DESC`, args);
  return { items: await Promise.all(rows.map(r => productionRow(r))) };
}

async function productionGet(pid, p) {
  const pr = await one(`SELECT * FROM yt_productions WHERE id=$1`, [pid]);
  if (!pr) throw new HttpError(404, "Production item not found");
  const d = await productionRow(pr, true);
  if (p.get("transcript") !== "0" && pr.source_video_id) {
    try { d.source_transcript = (await getTranscript(pr.source_video_id)).text; }
    catch (e) { d.source_transcript = null; d.transcript_error = e.message; d.transcript_code = e.code; }
  }
  return d;
}

async function productionCreate(id, b) {
  await wsOr404(id);
  const vid = await ensureVideo(b.video_id || "");
  if (!vid) throw new HttpError(400, "Video not found");
  const fmt = b.format === "short" ? "short" : "long";
  const dup = await one(`SELECT id FROM yt_productions WHERE workspace_id=$1 AND source_video_id=$2 AND format=$3 AND status<>'published'`, [id, vid, fmt]);
  if (dup) return { id: dup.id, existing: true };
  const r = await one(`INSERT INTO yt_productions(workspace_id, source_video_id, format, status, notes) VALUES($1,$2,$3,'queued',$4) RETURNING id`,
    [id, vid, fmt, b.notes || ""]);
  return { id: r.id };
}

async function productionUpdate(pid, b) {
  const pr = await one(`SELECT * FROM yt_productions WHERE id=$1`, [pid]);
  if (!pr) throw new HttpError(404, "Production item not found");
  let status = b.status || pr.status, myVid = pr.my_video_id;
  if (!STATUSES.includes(status)) throw new HttpError(400, `Status must be one of ${STATUSES.join(", ")}`);
  if (b.my_video) {
    myVid = await ensureVideo(b.my_video);
    if (!myVid) throw new HttpError(400, "Couldn't find that video. Paste the full YouTube link of your published video.");
    status = "published";
    if (pr.source_video_id) await q(`INSERT INTO yt_links(workspace_id, my_video_id, original_video_id, source) VALUES($1,$2,$3,'production') ON CONFLICT DO NOTHING`,
      [pr.workspace_id, myVid, pr.source_video_id]);
  }
  await q(`UPDATE yt_productions SET status=$1, notes=$2, format=$3, my_video_id=$4, updated_at=now() WHERE id=$5`,
    [status, b.notes ?? pr.notes, b.format || pr.format, myVid, pid]);
  return { ok: true };
}

async function productionScript(pid, b) {
  const script = (b.script || "").trim();
  if (!script) throw new HttpError(400, "script is empty");
  const r = await q(`UPDATE yt_productions SET script=$1, scripted_at=now(), updated_at=now(),
                     status = CASE WHEN status='queued' THEN 'scripted' ELSE status END WHERE id=$2 RETURNING id`, [script, pid]);
  if (!r.length) throw new HttpError(404, "Production item not found");
  return { ok: true };
}

// ------------------------------------------------------------------ PC bridge: transcripts + one-time import
async function uploadTranscript(b) {
  if (!/^[\w-]{11}$/.test(b.video_id || "")) throw new HttpError(400, "Bad video id");
  let text = b.text;
  if (!text && Array.isArray(b.snippets)) text = paragraphs(b.snippets);
  if (!text) throw new HttpError(400, "text missing");
  await q(`INSERT INTO yt_transcripts(video_id, lang, text, source) VALUES($1,$2,$3,'pc')
           ON CONFLICT(video_id) DO UPDATE SET text=EXCLUDED.text, lang=EXCLUDED.lang, source='pc', fetched_at=now()`, [b.video_id, b.lang || "en", text]);
  await q(`DELETE FROM yt_transcript_requests WHERE video_id=$1`, [b.video_id]);
  return { ok: true };
}

const IMPORT_TABLES = {
  yt_channels: "(id) DO NOTHING", yt_videos: "(id) DO NOTHING", yt_video_snaps: "DO NOTHING", yt_workspaces: "(id) DO NOTHING",
  yt_workspace_channels: "DO NOTHING", yt_saved: "DO NOTHING", yt_hidden: "DO NOTHING", yt_transcripts: "(video_id) DO NOTHING",
  yt_productions: "(id) DO NOTHING", yt_links: "DO NOTHING", yt_quota: "DO NOTHING",
};
async function importRows(b) {
  const conflict = IMPORT_TABLES[b.table];
  if (!conflict) throw new HttpError(400, "Unknown table");
  await bulkInsert(b.table, b.rows || [], { conflict });
  if (b.table === "yt_workspaces" || b.table === "yt_productions")
    await q(`SELECT setval(pg_get_serial_sequence('${b.table}','id'), GREATEST((SELECT COALESCE(MAX(id),1) FROM ${b.table}), 1))`);
  return { ok: true, n: (b.rows || []).length };
}

// ------------------------------------------------------------------ routes
const N = x => +x;
const ROUTES = [
  ["GET", /^\/state$/, () => state()],
  ["POST", /^\/workspaces$/, (m, p, b) => createWs(b)],
  ["PATCH", /^\/workspaces\/(\d+)$/, (m, p, b) => updateWs(N(m[1]), b)],
  ["DELETE", /^\/workspaces\/(\d+)$/, m => deleteWs(N(m[1]))],
  ["GET", /^\/workspaces\/(\d+)\/channels$/, m => listChannels(N(m[1]))],
  ["POST", /^\/workspaces\/(\d+)\/channels$/, (m, p, b) => addChannels(N(m[1]), b)],
  ["DELETE", /^\/workspaces\/(\d+)\/channels\/([\w-]+)$/, async m => { await q(`DELETE FROM yt_workspace_channels WHERE workspace_id=$1 AND channel_id=$2`, [N(m[1]), m[2]]); return { ok: true }; }],
  ["POST", /^\/workspaces\/(\d+)\/discover$/, (m, p, b) => discover(N(m[1]), b)],
  ["GET", /^\/workspaces\/(\d+)\/refresh-plan$/, m => refreshPlan(N(m[1]))],
  ["POST", /^\/refresh$/, (m, p, b) => refreshChannels((b.channel_ids || []).slice(0, 12))],
  ["GET", /^\/workspaces\/(\d+)\/videos$/, (m, p) => videos(N(m[1]), p)],
  ["GET", /^\/workspaces\/(\d+)\/topics$/, (m, p) => topics(N(m[1]), p)],
  ["POST", /^\/workspaces\/(\d+)\/saved$/, (m, p, b) => toggle(N(m[1]), "yt_saved", b, true)],
  ["POST", /^\/workspaces\/(\d+)\/unsave$/, (m, p, b) => toggle(N(m[1]), "yt_saved", b, false)],
  ["POST", /^\/workspaces\/(\d+)\/hide$/, (m, p, b) => toggle(N(m[1]), "yt_hidden", b, true)],
  ["POST", /^\/workspaces\/(\d+)\/unhide$/, (m, p, b) => toggle(N(m[1]), "yt_hidden", b, false)],
  ["GET", /^\/transcript\/([\w-]{11})$/, m => transcript(m[1])],
  ["GET", /^\/workspaces\/(\d+)\/myvideos$/, m => myVideosRoute(N(m[1]))],
  ["GET", /^\/compare$/, (m, p) => compare(p)],
  ["POST", /^\/workspaces\/(\d+)\/links$/, (m, p, b) => link(N(m[1]), b, true)],
  ["POST", /^\/workspaces\/(\d+)\/unlink$/, (m, p, b) => link(N(m[1]), b, false)],
  ["GET", /^\/production$/, (m, p) => productions(p)],
  ["GET", /^\/production\/(\d+)$/, (m, p) => productionGet(N(m[1]), p)],
  ["POST", /^\/workspaces\/(\d+)\/production$/, (m, p, b) => productionCreate(N(m[1]), b)],
  ["PATCH", /^\/production\/(\d+)$/, (m, p, b) => productionUpdate(N(m[1]), b)],
  ["POST", /^\/production\/(\d+)\/script$/, (m, p, b) => productionScript(N(m[1]), b)],
  ["DELETE", /^\/production\/(\d+)$/, async m => { await q(`DELETE FROM yt_productions WHERE id=$1`, [N(m[1])]); return { ok: true }; }],
  ["GET", /^\/transcript-requests$/, async () => ({ items: await q(`SELECT video_id, requested_at FROM yt_transcript_requests ORDER BY requested_at`) })],
  ["POST", /^\/transcripts$/, (m, p, b) => uploadTranscript(b)],
  ["POST", /^\/import$/, (m, p, b) => importRows(b)],
];

export function GET(request) { return handle(request); }
export function POST(request) { return handle(request); }
export function PATCH(request) { return handle(request); }
export function DELETE(request) { return handle(request); }
