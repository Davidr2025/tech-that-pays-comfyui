import { XMLParser } from "fast-xml-parser";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "data");

const UA =
  "MississaugaInsiderBot/1.0 (local-news aggregator; excerpts+attribution only; contact: site owner)";

export function log(msg) {
  console.log(`[pipeline] ${msg}`);
}
export function warn(msg) {
  console.warn(`[pipeline] WARN: ${msg}`);
}

export async function fetchText(url, { timeoutMs = 20000, headers = {} } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": UA, accept: "*/*", ...headers }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

export async function fetchJson(url, opts = {}) {
  const text = await fetchText(url, opts);
  return JSON.parse(text);
}

/** Try candidate URLs in order; return { url, text } of first success. */
export async function tryCandidates(candidates, validate = () => true) {
  for (const url of candidates) {
    try {
      const text = await fetchText(url);
      if (validate(text)) return { url, text };
      warn(`${url} responded but failed validation`);
    } catch (e) {
      warn(`${url} failed: ${e.message}`);
    }
  }
  return null;
}

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  cdataPropName: "__cdata",
  trimValues: true
});

function textOf(node) {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (node.__cdata != null) return textOf(node.__cdata);
  if (node["#text"] != null) return textOf(node["#text"]);
  return "";
}

export function stripHtml(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#0?39;/g, "'")
    .replace(/&#821[67];/g, "'")
    .replace(/&#822[01];/g, '"')
    .replace(/&quot;/g, '"')
    .replace(/&#8230;|&hellip;/g, "…")
    .replace(/&#8211;|&ndash;|&#8212;|&mdash;/g, "–")
    .replace(/\s+/g, " ")
    .trim();
}

/** Keep 1–2 sentences, max ~240 chars — excerpt only, never full articles. */
export function excerpt(text, maxLen = 240) {
  const clean = stripHtml(text);
  if (!clean) return "";
  const sentences = clean.match(/[^.!?]+[.!?]+(\s|$)/g);
  let out = "";
  if (sentences) {
    for (const s of sentences) {
      if ((out + s).length > maxLen) break;
      out += s;
      if (out.split(/[.!?]+\s/).length > 2) break;
    }
  }
  if (!out) out = clean.slice(0, maxLen);
  out = out.trim();
  if (clean.length > out.length && !/[.!?]$/.test(out)) out += "…";
  return out;
}

/** Parse RSS 2.0 or Atom into normalized items. */
export function parseFeed(xmlText) {
  const doc = xml.parse(xmlText);
  const items = [];
  const channel = doc?.rss?.channel;
  if (channel) {
    const raw = Array.isArray(channel.item) ? channel.item : channel.item ? [channel.item] : [];
    for (const it of raw) {
      items.push({
        title: stripHtml(textOf(it.title)),
        link: textOf(it.link) || it.link?.["@_href"] || "",
        publishedAt: toIso(textOf(it.pubDate) || textOf(it["dc:date"])),
        description: textOf(it.description) || textOf(it["content:encoded"]) || ""
      });
    }
    return { title: stripHtml(textOf(channel.title)), items };
  }
  const feed = doc?.feed;
  if (feed) {
    const raw = Array.isArray(feed.entry) ? feed.entry : feed.entry ? [feed.entry] : [];
    for (const it of raw) {
      let link = "";
      const links = Array.isArray(it.link) ? it.link : it.link ? [it.link] : [];
      const alt = links.find((l) => l["@_rel"] === "alternate") || links[0];
      if (alt) link = alt["@_href"] || textOf(alt);
      items.push({
        title: stripHtml(textOf(it.title)),
        link,
        publishedAt: toIso(textOf(it.published) || textOf(it.updated)),
        description: textOf(it.summary) || textOf(it.content) || ""
      });
    }
    return { title: stripHtml(textOf(feed.title)), items };
  }
  throw new Error("Not a recognizable RSS/Atom feed");
}

export function looksLikeFeed(text) {
  const head = text.slice(0, 2000).toLowerCase();
  return head.includes("<rss") || head.includes("<feed");
}

export function toIso(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d) ? null : d.toISOString();
}

export function readData(file, fallback = null) {
  const p = join(DATA_DIR, file);
  if (!existsSync(p)) return fallback;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

/**
 * Write a data file, but never clobber good data with an empty result:
 * if `items` is empty and the existing file has items, keep the old file.
 */
export function writeData(file, payload, { keepOldIfEmpty = true } = {}) {
  mkdirSync(DATA_DIR, { recursive: true });
  const p = join(DATA_DIR, file);
  if (keepOldIfEmpty && Array.isArray(payload.items) && payload.items.length === 0) {
    const old = readData(file);
    if (old && Array.isArray(old.items) && old.items.length > 0) {
      warn(`${file}: new fetch returned 0 items — keeping previous data`);
      return false;
    }
  }
  writeFileSync(p, JSON.stringify(payload, null, 2) + "\n");
  log(`wrote ${file} (${Array.isArray(payload.items) ? payload.items.length + " items" : "ok"})`);
  return true;
}
