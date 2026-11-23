// Scoring for YouTube Research: outliers, "about to explode", trending phrases, my-video tracking,
// and yours-vs-the-original comparisons. Pure maths on public YouTube numbers. No guessing.
import { q } from "./db.js";

export const BASELINE_MIN_AGE_DAYS = 7;   // videos younger than this don't count toward a channel's median
const GROWTH_TAU_DAYS = 7, GROWTH_SHAPE = 0.5; // typical view curve, front-loaded
const EXPLODE_MIN_AGE_H = 12, EXPLODE_MAX_AGE_D = 14;
const AD_LIKES_PER_1000 = 0.5, AD_MIN_VIEWS = 10000;  // promoted videos: huge views, ~no likes
const TOPIC_MAX_SHARE = 0.2;

export const growthFraction = d => Math.max(0.05, 1 - Math.exp(-Math.pow(d / GROWTH_TAU_DAYS, GROWTH_SHAPE)));
export const likelyAd = (views, likes) => !!views && views >= AD_MIN_VIEWS && (likes || 0) * 1000 / views < AD_LIKES_PER_1000;
export function median(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const r2 = x => x == null ? null : Math.round(x * 100) / 100;
const ageDays = (pub, now) => Math.max((now - new Date(pub)) / 864e5, 1 / 24);

async function momentumFor(ids) {
  const out = new Map();
  if (!ids.length) return out;
  const rows = await q(`SELECT video_id, ts, views FROM yt_video_snaps WHERE video_id = ANY($1) ORDER BY video_id, ts`, [ids]);
  for (const r of rows) {
    if (!out.has(r.video_id)) out.set(r.video_id, []);
    out.get(r.video_id).push({ ts: new Date(r.ts).getTime(), views: +r.views });
  }
  return out;
}

/** Score every video from the given channels published in the last `days`. */
export async function compute(channelIds, days = 90, { includeAds = false } = {}) {
  if (!channelIds.length) return [];
  const now = Date.now();
  const rows = await q(`SELECT v.*, c.title AS ch_title, c.handle, c.subs, c.thumb AS ch_thumb
                        FROM yt_videos v JOIN yt_channels c ON c.id = v.channel_id
                        WHERE v.channel_id = ANY($1) AND NOT v.is_live AND v.views IS NOT NULL`, [channelIds]);
  const pool = new Map();
  for (const r of rows) {
    if (likelyAd(+r.views, +r.likes) || ageDays(r.published_at, now) < BASELINE_MIN_AGE_DAYS) continue;
    const k = r.channel_id + "|" + r.is_short;
    if (!pool.has(k)) pool.set(k, []);
    pool.get(k).push([r.id, +r.views]);
  }
  const win = rows.filter(r => ageDays(r.published_at, now) <= days && (includeAds || !likelyAd(+r.views, +r.likes)));
  const snaps = await momentumFor(win.map(r => r.id));
  const out = [];
  for (const r of win) {
    const others = (pool.get(r.channel_id + "|" + r.is_short) || []).filter(([id]) => id !== r.id).map(x => x[1]);
    if (others.length < 5) continue;
    const med = median(others) || 1, views = +r.views, age = ageDays(r.published_at, now);
    const ageAdj = views / (med * growthFraction(age));
    const lifetimeVph = views / (age * 24);
    let recentVph = null, momentum = null;
    const s = snaps.get(r.id) || [];
    if (s.length >= 2) {
      const last = s[s.length - 1];
      for (let i = s.length - 2; i >= 0; i--) {
        const gapH = (last.ts - s[i].ts) / 36e5;
        if (gapH >= 1) { recentVph = Math.max(0, last.views - s[i].views) / gapH; momentum = lifetimeVph ? recentVph / lifetimeVph : null; break; }
      }
    }
    const mFactor = momentum == null ? 1 : Math.sqrt(Math.min(Math.max(momentum, 0.25), 4));
    const young = age >= EXPLODE_MIN_AGE_H / 24 && age <= EXPLODE_MAX_AGE_D;
    const subs = r.subs != null ? +r.subs : 0;
    out.push({
      id: r.id, url: `https://www.youtube.com/watch?v=${r.id}`, title: r.title, thumb: r.thumb,
      channel: r.ch_title, handle: r.handle, channel_id: r.channel_id, subs, channel_thumb: r.ch_thumb,
      published_at: r.published_at, age_days: r2(age), is_short: !!r.is_short, duration: r.duration,
      views, likes: +r.likes, comments: +r.comments, median_views: Math.round(med),
      multiplier: r2(views / med), age_adj_multiplier: r2(ageAdj),
      views_per_sub: subs ? r2(views / subs) : null,
      engagement: views ? r2(100 * (+r.likes + +r.comments) / views) : null,
      lifetime_vph: Math.round(lifetimeVph * 10) / 10, recent_vph: recentVph == null ? null : Math.round(recentVph * 10) / 10,
      momentum: r2(momentum), explode_score: young ? r2(ageAdj * mFactor) : null, snapshots: s.length,
    });
  }
  return out;
}

// ------------------------------------------------------------------ trending phrases
export const STOP = new Set(`a an the and or but of to in on for with at by from is are was were be been it its this that these those
i you he she we they me my your our their his her them us how what why when who which where do does did can will just
not no so if as vs than then into out up about over more most new video full official part episode ep 2024 2025
2026 2027 one two get got make made best top ever here there all every only really very much now without turned
use using still finally just like need know want`.split(/\s+/));

const words = s => (String(s || "").toLowerCase().match(/[a-z0-9$']+/g) || []).filter(w => w.length > 1);
function ngrams(title) {
  const w = words(title), seen = new Set();
  for (const n of [1, 2, 3]) for (let i = 0; i + n <= w.length; i++) {
    const g = w.slice(i, i + n);
    if (!STOP.has(g[0]) && !STOP.has(g[g.length - 1])) seen.add(g.join(" "));
  }
  return seen;
}
export function topicTable(videos, minMult = 3, top = 40) {
  const df = new Map();
  for (const v of videos) for (const g of ngrams(v.title)) df.set(g, (df.get(g) || 0) + 1);
  const tooCommon = new Set([...df].filter(([, n]) => videos.length >= 20 && n / videos.length > TOPIC_MAX_SHARE).map(([g]) => g));
  const hits = new Map(), chans = new Map(), vids = new Map();
  for (const v of videos) {
    if (v.multiplier < minMult) continue;
    for (const g of ngrams(v.title)) {
      if (tooCommon.has(g)) continue;
      hits.set(g, (hits.get(g) || 0) + Math.log2(v.multiplier));
      if (!chans.has(g)) { chans.set(g, new Set()); vids.set(g, []); }
      chans.get(g).add(v.channel_id); vids.get(g).push(v);
    }
  }
  const rows = [...hits].filter(([g]) => chans.get(g).size >= 2).map(([g, s]) => ({
    phrase: g, score: Math.round(s * 10) / 10, channels: chans.get(g).size, videos: vids.get(g).length,
    example: vids.get(g).reduce((a, b) => (b.multiplier > a.multiplier ? b : a)).title,
  })).sort((a, b) => b.score - a.score);
  const keep = [];
  for (const r of rows) if (!keep.some(k => k.phrase.includes(r.phrase) && k.videos === r.videos)) keep.push(r);
  return keep.slice(0, top);
}

// ------------------------------------------------------------------ one video + channel baseline
export async function channelMedian(channelId, isShort, exclude = null, minN = 3) {
  const rows = await q(`SELECT id, views, likes, published_at FROM yt_videos
                        WHERE channel_id=$1 AND is_short=$2 AND NOT is_live AND views IS NOT NULL`, [channelId, !!isShort]);
  const now = Date.now();
  const vals = rows.filter(r => r.id !== exclude && !likelyAd(+r.views, +r.likes) && ageDays(r.published_at, now) >= BASELINE_MIN_AGE_DAYS)
    .map(r => +r.views);
  return vals.length >= minN ? Math.round(median(vals)) : null;
}

export async function videoStats(id) {
  const r = (await q(`SELECT v.*, c.title AS ch_title, c.handle, c.subs, c.thumb AS ch_thumb FROM yt_videos v
                      LEFT JOIN yt_channels c ON c.id=v.channel_id WHERE v.id=$1`, [id]))[0];
  if (!r || r.views == null) return null;
  const now = Date.now(), age = ageDays(r.published_at, now), views = +r.views, likes = +r.likes, comments = +r.comments;
  const med = await channelMedian(r.channel_id, r.is_short, id);
  const snaps = await q(`SELECT ts, views FROM yt_video_snaps WHERE video_id=$1 ORDER BY ts`, [id]);
  let gained24 = null;
  if (snaps.length >= 2) {
    const last = snaps[snaps.length - 1];
    for (let i = snaps.length - 2; i >= 0; i--) {
      const gap = (new Date(last.ts) - new Date(snaps[i].ts)) / 36e5;
      if (gap >= 12) { gained24 = Math.round((+last.views - +snaps[i].views) * 24 / gap); break; }
    }
  }
  return {
    id, url: `https://www.youtube.com/watch?v=${id}`, title: r.title, thumb: r.thumb, hq_thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    channel: r.ch_title, handle: r.handle, channel_id: r.channel_id, subs: r.subs != null ? +r.subs : null, channel_thumb: r.ch_thumb,
    published_at: r.published_at, age_days: r2(age), duration: r.duration, is_short: !!r.is_short, views, likes, comments,
    like_rate: views ? r2(100 * likes / views) : null, comment_rate: views ? Math.round(100000 * comments / views) / 1000 : null,
    engagement: views ? r2(100 * (likes + comments) / views) : null, median_views: med,
    multiplier: med ? r2(views / med) : null, age_adj: med ? r2(views / (med * growthFraction(age))) : null,
    views_per_day: Math.round(views / age), gained_24h: gained24,
  };
}

// ------------------------------------------------------------------ my channel
const keyWords = s => new Set(words(s).filter(w => !STOP.has(w)));
export function titleSimilarity(a, b) {
  const A = keyWords(a), B = keyWords(b);
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

export async function myVideos(wsId, channelId, limit = 100) {
  const ids = (await q(`SELECT id FROM yt_videos WHERE channel_id=$1 AND NOT is_live ORDER BY published_at DESC LIMIT $2`, [channelId, limit])).map(r => r.id);
  const vids = (await Promise.all(ids.map(videoStats))).filter(Boolean);
  const links = await q(`SELECT my_video_id, original_video_id, source FROM yt_links WHERE workspace_id=$1`, [wsId]);
  const followed = (await q(`SELECT channel_id FROM yt_workspace_channels WHERE workspace_id=$1`, [wsId])).map(r => r.channel_id);
  const candidates = followed.length
    ? await q(`SELECT id, channel_id, title, published_at FROM yt_videos WHERE channel_id = ANY($1)`, [followed]) : [];
  for (const v of vids) {
    v.links = [];
    for (const l of links.filter(l => l.my_video_id === v.id)) {
      const o = await videoStats(l.original_video_id);
      if (o) v.links.push({ source: l.source, original: { id: o.id, title: o.title, thumb: o.thumb, channel: o.channel, views: o.views, age_adj: o.age_adj } });
    }
    v.suggested_original = null;
    if (!v.links.length) {
      let best = null, bestS = 0;
      for (const c of candidates) {
        if (new Date(c.published_at) >= new Date(v.published_at)) continue;
        const s = titleSimilarity(v.title, c.title);
        if (s > bestS) { best = c; bestS = s; }
      }
      if (best && bestS >= 0.34) v.suggested_original = { id: best.id, title: best.title, similarity: r2(bestS) };
    }
  }
  const longs = vids.filter(v => !v.is_short), pick = longs.length ? longs : vids;
  const best = pick.reduce((a, b) => (!a || (b.age_adj ?? b.views) > (a.age_adj ?? a.views) ? b : a), null);
  return {
    videos: vids,
    summary: {
      count: vids.length, total_views: vids.reduce((s, v) => s + v.views, 0),
      last30_views: vids.filter(v => v.age_days <= 30).reduce((s, v) => s + v.views, 0),
      median_views: await channelMedian(channelId, false, null, 1),
      best: best ? { id: best.id, title: best.title, views: best.views, age_adj: best.age_adj } : null,
    },
  };
}

// ------------------------------------------------------------------ yours vs the original
const POWER = new Set(`secret secrets free fast easy simple new best worst stop never always truth mistake mistakes hidden exposed
shocking insane crazy proven exact ultimate complete beginner beginners step guide warning why how what nobody everyone instantly
automatic automate automated millions thousands money changed changes rules finally only real`.split(/\s+/));

export function titleDiff(mine, orig) {
  const mw = keyWords(mine), ow = keyWords(orig);
  return {
    mine_len: mine.length, orig_len: orig.length,
    shared: [...mw].filter(w => ow.has(w)).sort(), missing_from_mine: [...ow].filter(w => !mw.has(w)).sort().slice(0, 12),
    orig_has_number: /\d/.test(orig), mine_has_number: /\d/.test(mine),
    orig_power: [...ow].filter(w => POWER.has(w)).sort(), mine_power: [...mw].filter(w => POWER.has(w)).sort(),
    similarity: r2(titleSimilarity(mine, orig)),
  };
}

export function shingleSimilarity(a, b, n = 4) {
  const sh = t => { const w = words(t.replace(/\[\d+:\d\d\]/g, " ")); const s = new Set(); for (let i = 0; i + n <= w.length; i++) s.add(w.slice(i, i + n).join(" ")); return s; };
  const A = sh(a), B = sh(b);
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const x of A) if (B.has(x)) inter++;
  return inter / Math.min(A.size, B.size);
}

export function scriptStats(text, duration) {
  const plain = text.replace(/\[\d+:\d\d\]\s*/g, "");
  const wc = plain.split(/\s+/).filter(Boolean).length, mins = (duration || 1) / 60;
  return { words: wc, wpm: mins ? Math.round(wc / mins) : null, hook: (text.split("\n\n")[0] || "").replace(/^\[\d+:\d\d\]\s*/, "").slice(0, 600) };
}

export function diagnose(m, o, title, script) {
  const sug = [], add = (area, level, text) => sug.push({ area, level, text });
  if (m.age_days < 2) add("Timing", "info", "Your video is under 2 days old. The numbers will settle after 48 hours, so judge it then.");
  const rel = m.age_adj, orel = o.age_adj;
  let verdict;
  if (rel == null) verdict = ["neutral", "Not enough history on your channel yet to judge this fairly. We need at least 3 of your videos older than a week. Until then, compare raw views and engagement below."];
  else if (rel >= 1.5) verdict = ["good", `Doing well: ${rel.toFixed(1)}× what your channel normally gets by this age.`];
  else if (rel >= 0.8) verdict = ["neutral", `About normal for your channel (${rel.toFixed(1)}× your typical video at this age).`];
  else verdict = ["bad", `Under-performing: ${rel.toFixed(1)}× your typical video at this age.`];
  if (orel) verdict[1] += ` The original did ${orel.toFixed(1)}× its channel's normal.`;
  const engRatio = m.engagement && o.engagement ? m.engagement / o.engagement : null;
  if (rel != null && rel < 1 && engRatio != null && engRatio >= 0.8)
    add("Title & thumbnail", "high", `People who watched liked it as much as the original's viewers did (${m.engagement}% vs ${o.engagement}% engagement), but fewer people clicked. The packaging is the bottleneck, so test a new title and thumbnail before changing the content.`);
  if (engRatio != null && engRatio < 0.6)
    add("Script & delivery", "high", `Engagement is ${m.engagement}% vs ${o.engagement}% on the original. Viewers who clicked reacted less, which points at the hook, pacing or payoff rather than the title.`);
  if (title.orig_has_number && !title.mine_has_number) add("Title & thumbnail", "medium", "The original's title uses a number (a count, price or year). Yours doesn't. Numbers set clear expectations and usually lift clicks.");
  if (title.mine_len > 70) add("Title & thumbnail", "medium", `Your title is ${title.mine_len} characters, so it gets cut off on mobile. Keep the hook in the first 50–60.`);
  const missingPower = title.orig_power.filter(w => !title.mine_power.includes(w));
  if (missingPower.length) add("Title & thumbnail", "low", `The original leans on: ${missingPower.join(", ")}. Your title doesn't use these trigger words.`);
  if (title.similarity < 0.2 && title.missing_from_mine.length) add("Title & thumbnail", "low", `Your title shares few keywords with the original (${title.missing_from_mine.slice(0, 6).join(", ")}). If the topic is what made it pop, people search and browse for those words.`);
  add("Title & thumbnail", "check", "Compare the thumbnails side by side: one clear focal point, 3 words or fewer of text, readable at phone size, and a face or emotion if the original used one.");
  if (m.duration && o.duration && !m.is_short) {
    const r = m.duration / o.duration;
    if (r > 1.4) add("Script & delivery", "medium", `Yours is ${r.toFixed(1)}× longer (${Math.floor(m.duration / 60)} vs ${Math.floor(o.duration / 60)} min). Cut setup and repetition. Longer only wins if every minute earns it.`);
    else if (r < 0.6) add("Script & delivery", "low", `Yours is much shorter (${Math.floor(m.duration / 60)} vs ${Math.floor(o.duration / 60)} min). The original may cover more of what viewers came for.`);
  }
  if (script?.mine?.wpm && script?.original?.wpm && script.mine.wpm < script.original.wpm * 0.8)
    add("Script & delivery", "medium", `You speak about ${script.mine.wpm} words/min vs ${script.original.wpm} in the original. A slower pace often means lower retention. Tighten pauses in the edit.`);
  if (script?.similarity != null && script.similarity > 0.35)
    add("Script & delivery", "medium", `${Math.round(script.similarity * 100)}% of your phrasing matches the original. Rewriting more in your own voice and examples helps you stand out (and avoids reuse issues).`);
  if (!sug.some(s => s.level === "high" || s.level === "medium") && verdict[0] === "good")
    add("Overall", "info", "Nothing stands out as a problem. Reuse this title and thumbnail pattern on your next video.");
  const order = { high: 0, medium: 1, low: 2, check: 3, info: 4 };
  sug.sort((a, b) => order[a.level] - order[b.level]);
  return { verdict: { tone: verdict[0], text: verdict[1] }, suggestions: sug };
}
