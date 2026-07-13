import config from "../site.config.mjs";
import {
  fetchText, parseFeed, looksLikeFeed, excerpt, writeData, log, warn
} from "./lib/util.mjs";

/** Try each candidate URL until one yields a feed with at least one item. */
async function firstWorkingFeed(src) {
  for (const url of src.candidates) {
    try {
      const text = await fetchText(url);
      if (!looksLikeFeed(text)) {
        warn(`news: ${url} responded but is not a feed`);
        continue;
      }
      const feed = parseFeed(text);
      const items = feed.items.filter((it) => it.title && it.link);
      if (items.length === 0) {
        warn(`news: ${url} is a valid feed but has 0 items — trying next candidate`);
        continue;
      }
      return { url, items };
    } catch (e) {
      warn(`news: ${url} failed: ${e.message}`);
    }
  }
  return null;
}

export async function fetchNews() {
  const { sources, keywords, maxPerSource, maxTotal } = config.news;
  const all = [];

  for (const src of sources) {
    const hit = await firstWorkingFeed(src);
    if (!hit) {
      warn(`news: no working feed for ${src.name}`);
      continue;
    }
    let items = hit.items;
    if (src.filter) {
      items = items.filter((it) => {
        const hay = `${it.title} ${it.description}`.toLowerCase();
        return keywords.some((k) => hay.includes(k));
      });
    }
    items = items.slice(0, maxPerSource).map((it) => {
      // Google News aggregates many outlets: credit the real publisher from
      // the per-item <source> tag, and drop the " - Publisher" title suffix.
      if (src.type === "googlenews") {
        const publisher = it.sourceName || "Google News";
        return {
          title: it.title.replace(new RegExp(`\\s*[-–|]\\s*${publisher.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`), ""),
          summary: "",
          url: it.link,
          source: publisher,
          sourceUrl: it.sourceUrl || src.homepage,
          publishedAt: it.publishedAt
        };
      }
      return {
        title: it.title,
        summary: excerpt(it.description),
        url: it.link,
        source: src.name,
        sourceUrl: src.homepage,
        publishedAt: it.publishedAt
      };
    });
    log(`news: ${src.name} → ${items.length} items (via ${hit.url})`);
    all.push(...items);
  }

  // de-dupe by normalized title, newest first
  const seen = new Set();
  const deduped = all
    .filter((it) => {
      const key = it.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
    .slice(0, maxTotal);

  return writeData("news.json", {
    updatedAt: new Date().toISOString(),
    items: deduped
  });
}
