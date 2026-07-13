import config from "../site.config.mjs";
import {
  tryCandidates, parseFeed, looksLikeFeed, excerpt, writeData, log, warn
} from "./lib/util.mjs";

export async function fetchNews() {
  const { sources, keywords, maxPerSource, maxTotal } = config.news;
  const all = [];

  for (const src of sources) {
    const hit = await tryCandidates(src.candidates, looksLikeFeed);
    if (!hit) {
      warn(`news: no working feed for ${src.name}`);
      continue;
    }
    let feed;
    try {
      feed = parseFeed(hit.text);
    } catch (e) {
      warn(`news: parse failed for ${src.name}: ${e.message}`);
      continue;
    }
    let items = feed.items.filter((it) => it.title && it.link);
    if (src.filter) {
      items = items.filter((it) => {
        const hay = `${it.title} ${it.description}`.toLowerCase();
        return keywords.some((k) => hay.includes(k));
      });
    }
    items = items.slice(0, maxPerSource).map((it) => ({
      title: it.title,
      summary: excerpt(it.description),
      url: it.link,
      source: src.name,
      sourceUrl: src.homepage,
      publishedAt: it.publishedAt
    }));
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
