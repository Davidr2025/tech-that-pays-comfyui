// YouTube Data API v3 + caption fetching for YouTube Research.
// Env: YOUTUBE_API_KEY (free key from Google Cloud; 10,000 units/day).
import { q, one, bulkInsert } from "./db.js";

const API = "https://www.googleapis.com/youtube/v3/";
const COST = { search: 100, channels: 1, playlistItems: 1, videos: 1 };
export const SHORT_MAX_SECONDS = 180;

export class QuotaError extends Error {}

export async function yt(endpoint, params) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("YOUTUBE_API_KEY isn't set in Vercel yet");
  const url = API + endpoint + "?" + new URLSearchParams({ ...params, key });
  const res = await fetch(url);
  const day = new Date().toISOString().slice(0, 10);
  await q(`INSERT INTO yt_quota(day, units) VALUES($1,$2) ON CONFLICT(day) DO UPDATE SET units = yt_quota.units + $2`, [day, COST[endpoint]]);
  if (!res.ok) {
    const body = await res.text();
    if (/quotaExceeded|dailyLimitExceeded/.test(body)) throw new QuotaError("YouTube API daily quota used up; it resets at midnight Pacific.");
    throw new Error(`YouTube API ${res.status} on ${endpoint}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

export async function quotaToday() {
  const r = await one(`SELECT units FROM yt_quota WHERE day=$1`, [new Date().toISOString().slice(0, 10)]);
  return r ? r.units : 0;
}

export function parseDuration(s) {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(s || "");
  if (!m) return 0;
  const [d, h, mi, se] = m.slice(1).map(x => +(x || 0));
  return d * 86400 + h * 3600 + mi * 60 + se;
}

// ------------------------------------------------------------------ channels
export async function storeChannels(items, source) {
  const rows = items.map(it => {
    const sn = it.snippet || {}, st = it.statistics || {}, cd = it.contentDetails || {}, th = sn.thumbnails || {};
    return {
      id: it.id, title: sn.title ?? null, handle: sn.customUrl ?? null, uploads: cd.relatedPlaylists?.uploads ?? null,
      subs: st.hiddenSubscriberCount ? null : +(st.subscriberCount || 0), video_count: +(st.videoCount || 0),
      view_count: +(st.viewCount || 0), thumb: (th.default || th.medium || {}).url ?? null, source,
    };
  });
  await bulkInsert("yt_channels", rows, {
    conflict: `(id) DO UPDATE SET title=EXCLUDED.title, handle=EXCLUDED.handle, uploads=EXCLUDED.uploads, subs=EXCLUDED.subs,
      video_count=EXCLUDED.video_count, view_count=EXCLUDED.view_count, thumb=COALESCE(EXCLUDED.thumb, yt_channels.thumb)`,
  });
  return rows.map(r => r.id);
}

export async function fetchChannels(ids, source) {
  const out = [];
  const uniq = [...new Set(ids)];
  for (let i = 0; i < uniq.length; i += 50) {
    const d = await yt("channels", { part: "snippet,statistics,contentDetails", id: uniq.slice(i, i + 50).join(","), maxResults: 50 });
    out.push(...await storeChannels(d.items || [], source));
  }
  return out;
}

/** @handle, channel URL, UC… id, or any video URL from the channel -> channel id */
export async function resolveChannel(ref) {
  ref = (ref || "").trim();
  if (!ref || ref.startsWith("#")) return null;
  let m = /(?:v=|youtu\.be\/|\/shorts\/|\/live\/)([\w-]{11})/.exec(ref);
  if (m) {
    const d = await yt("videos", { part: "snippet", id: m[1] });
    return d.items?.[0]?.snippet?.channelId || null;
  }
  m = /(UC[\w-]{22})/.exec(ref);
  if (m) return m[1];
  m = /@([\w.\-]+)/.exec(ref);
  const d = await yt("channels", { part: "id", forHandle: m ? "@" + m[1] : ref });
  return d.items?.[0]?.id || null;
}

// ------------------------------------------------------------------ videos
export async function storeVideos(items) {
  const ts = new Date().toISOString();
  const vids = [], snaps = [];
  for (const it of items) {
    const sn = it.snippet, st = it.statistics || {}, cd = it.contentDetails || {}, th = sn.thumbnails || {};
    const dur = parseDuration(cd.duration);
    const live = ["live", "upcoming"].includes(sn.liveBroadcastContent) || !!it.liveStreamingDetails;
    const v = {
      id: it.id, channel_id: sn.channelId, title: sn.title, published_at: sn.publishedAt, duration: dur,
      is_short: dur > 0 && dur <= SHORT_MAX_SECONDS, is_live: live,
      thumb: (th.medium || th.high || th.default || {}).url ?? null,
      views: st.viewCount != null ? +st.viewCount : null, likes: +(st.likeCount || 0), comments: +(st.commentCount || 0),
      last_ts: st.viewCount != null ? ts : null,
    };
    vids.push(v);
    if (v.views != null) snaps.push({ video_id: v.id, ts, views: v.views, likes: v.likes, comments: v.comments });
  }
  await bulkInsert("yt_videos", vids, {
    conflict: `(id) DO UPDATE SET title=EXCLUDED.title, thumb=EXCLUDED.thumb, duration=EXCLUDED.duration, is_short=EXCLUDED.is_short,
      is_live=EXCLUDED.is_live, views=COALESCE(EXCLUDED.views, yt_videos.views), likes=EXCLUDED.likes, comments=EXCLUDED.comments,
      last_ts=COALESCE(EXCLUDED.last_ts, yt_videos.last_ts)`,
  });
  await bulkInsert("yt_video_snaps", snaps);
}

export async function fetchVideos(ids) {
  const uniq = [...new Set(ids)];
  for (let i = 0; i < uniq.length; i += 50) {
    const d = await yt("videos", { part: "snippet,statistics,contentDetails,liveStreamingDetails", id: uniq.slice(i, i + 50).join(",") });
    await storeVideos(d.items || []);
  }
}

/** Video URL or id -> id, fetching it (and its channel) if we've never seen it. */
export async function ensureVideo(ref) {
  const m = /(?:v=|youtu\.be\/|\/shorts\/|\/live\/|^)([\w-]{11})(?:$|[&?#\/])/.exec((ref || "").trim());
  if (!m) return null;
  const id = m[1];
  if (await one(`SELECT 1 FROM yt_videos WHERE id=$1 AND views IS NOT NULL`, [id])) return id;
  const d = await yt("videos", { part: "snippet,statistics,contentDetails,liveStreamingDetails", id });
  if (!d.items?.length) return null;
  const ch = d.items[0].snippet.channelId;
  if (!await one(`SELECT 1 FROM yt_channels WHERE id=$1`, [ch])) await fetchChannels([ch], "linked-video");
  await storeVideos(d.items);
  return id;
}

/**
 * Refresh a batch of channels. Cheap by design:
 *  - recent uploads (last 30 days) get fresh numbers every refresh
 *  - each channel's older videos (its baseline) are refreshed at most once a week
 */
export async function refreshChannels(ids, { recentDays = 30, baselineDays = 7, perChannel = 50 } = {}) {
  if (!ids.length) return { done: 0 };
  await fetchChannels(ids, "refresh");
  const chans = await q(`SELECT id, uploads, baseline_at FROM yt_channels WHERE id = ANY($1)`, [ids]);
  const cutoff = Date.now() - recentDays * 864e5;
  const toFetch = [], baselined = [];
  for (const c of chans) {
    if (!c.uploads) continue;
    let d;
    try { d = await yt("playlistItems", { part: "contentDetails", playlistId: c.uploads, maxResults: perChannel }); }
    catch (e) { if (e instanceof QuotaError) throw e; continue; }
    const items = d.items || [];
    const needBaseline = !c.baseline_at || Date.now() - new Date(c.baseline_at) > baselineDays * 864e5;
    for (const it of items) {
      const pub = new Date(it.contentDetails.videoPublishedAt || 0).getTime();
      if (needBaseline || pub >= cutoff) toFetch.push(it.contentDetails.videoId);
    }
    if (needBaseline) baselined.push(c.id);
  }
  await fetchVideos(toFetch);
  const now = new Date().toISOString();
  await q(`UPDATE yt_channels SET scanned_at=$1 WHERE id = ANY($2)`, [now, ids]);
  if (baselined.length) await q(`UPDATE yt_channels SET baseline_at=$1 WHERE id = ANY($2)`, [now, baselined]);
  return { done: ids.length, videos: toFetch.length };
}

export async function searchYouTube(query, days = 30, fmt = "both") {
  const p = {
    part: "snippet", type: "video", q: query, order: "viewCount", maxResults: 50,
    publishedAfter: new Date(Date.now() - days * 864e5).toISOString().replace(/\.\d+Z$/, "Z"),
    videoDuration: { short: "short", long: "medium" }[fmt] || "any",
  };
  const d = await yt("search", p);
  const items = d.items || [];
  const videoIds = items.map(i => i.id.videoId), channelIds = [...new Set(items.map(i => i.snippet.channelId))];
  await fetchChannels(channelIds, `discover:${query}`);
  await fetchVideos(videoIds);
  return { videoIds, channelIds };
}

// ------------------------------------------------------------------ transcripts
// Same approach as the youtube-transcript-api library: ask YouTube's player API for the caption
// tracks, then download the track. YouTube often blocks this from cloud servers; when it does,
// the request is queued and David's PC fills it in (content_machine.py fill-transcripts).
const decode = s => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

export function paragraphs(snips) {
  const paras = [];
  let cur = [], start = 0;
  for (const s of snips) {
    if (!cur.length) start = s.start;
    cur.push(s.text.replace(/\n/g, " ").trim());
    if (s.start - start >= 30) { paras.push(stamp(start) + " " + cur.join(" ")); cur = []; }
  }
  if (cur.length) paras.push(stamp(start) + " " + cur.join(" "));
  return paras.join("\n\n");
}
const stamp = t => `[${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}]`;

export async function fetchTranscriptFromYouTube(videoId) {
  const headers = { "Accept-Language": "en-US,en;q=0.9", "User-Agent": "Mozilla/5.0" };
  const page = await (await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, { headers })).text();
  const key = /"INNERTUBE_API_KEY":"([^"]+)"/.exec(page)?.[1];
  if (!key) throw new Error("blocked");
  const res = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${key}`, {
    method: "POST", headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ context: { client: { clientName: "ANDROID", clientVersion: "20.10.38" } }, videoId }),
  });
  const data = await res.json();
  const status = data.playabilityStatus?.status;
  if (status && status !== "OK") throw new Error(status === "LOGIN_REQUIRED" ? "blocked" : `unplayable (${status})`);
  const tracks = data.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  if (!tracks.length) throw new Error("no-captions");
  const en = tracks.filter(t => (t.languageCode || "").startsWith("en"));
  const track = en.find(t => t.kind !== "asr") || en[0] || tracks[0];
  const xml = await (await fetch(track.baseUrl.replace("&fmt=srv3", ""), { headers })).text();
  const snips = [...xml.matchAll(/<text start="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g)]
    .map(m => ({ start: +m[1], text: decode(decode(m[2])).replace(/<[^>]+>/g, "") }));
  if (!snips.length) throw new Error("blocked");
  return { text: paragraphs(snips), lang: track.languageCode };
}

/** Cached transcript, or try YouTube; on failure queue it for David's PC. */
export async function getTranscript(videoId) {
  const row = await one(`SELECT lang, text, source FROM yt_transcripts WHERE video_id=$1`, [videoId]);
  if (row) return { video_id: videoId, ...row, cached: true };
  try {
    const t = await fetchTranscriptFromYouTube(videoId);
    await q(`INSERT INTO yt_transcripts(video_id, lang, text, source) VALUES($1,$2,$3,'server') ON CONFLICT(video_id) DO NOTHING`, [videoId, t.lang, t.text]);
    await q(`DELETE FROM yt_transcript_requests WHERE video_id=$1`, [videoId]);
    return { video_id: videoId, ...t, cached: false };
  } catch (e) {
    const reason = e.message === "no-captions" ? "no-captions" : "blocked";
    if (reason === "blocked") {
      await q(`INSERT INTO yt_transcript_requests(video_id, reason) VALUES($1,$2) ON CONFLICT(video_id) DO NOTHING`, [videoId, e.message]);
    }
    const err = new Error(reason === "no-captions"
      ? "This video has no captions, so there's no script to pull."
      : "YouTube blocked the server from downloading this script. It's been queued for your PC: tell Claude \"fill my transcripts\" (or run the content machine) and it will appear here.");
    err.code = reason;
    throw err;
  }
}
