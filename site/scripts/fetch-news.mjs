import { chromium } from "playwright";
import config from "../site.config.mjs";
import {
  fetchText, parseFeed, looksLikeFeed, excerpt, stripHtml, toIso, writeData, log, warn, UA
} from "./lib/util.mjs";

/** WordPress REST API posts endpoint → normalized feed items. */
function parseWpJson(text) {
  const arr = JSON.parse(text);
  if (!Array.isArray(arr)) throw new Error("not a WP REST array");
  return arr.map((p) => ({
    title: stripHtml(p.title?.rendered || ""),
    link: p.link || "",
    publishedAt: toIso(p.date),
    // Some WP custom post types (e.g. mississauga.ca's "news") don't have
    // excerpt support registered, so excerpt.rendered comes back empty even
    // though the request succeeds — fall back to the full post body; it's
    // still run through excerpt()'s ~550-char cap downstream like every
    // other source, never published in full.
    description: p.excerpt?.rendered || p.content?.rendered || "",
    sourceName: "",
    sourceUrl: ""
  }));
}

/** Try each candidate URL until one yields at least one item. */
async function firstWorkingFeed(src) {
  for (const url of src.candidates) {
    try {
      const text = await fetchText(url);
      let items;
      if (text.trimStart().startsWith("[")) {
        items = parseWpJson(text);
      } else if (looksLikeFeed(text)) {
        items = parseFeed(text).items;
      } else {
        warn(`news: ${url} responded but is not a feed`);
        continue;
      }
      items = items.filter((it) => it.title && it.link);
      if (items.length === 0) {
        warn(`news: ${url} is valid but has 0 items — trying next candidate`);
        continue;
      }
      return { url, items };
    } catch (e) {
      warn(`news: ${url} failed: ${e.message}`);
    }
  }
  return null;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Google News RSS <link> URLs are redirects through news.google.com that
 * only resolve via client-side JavaScript — a plain HTTP fetch just lands
 * on Google's own interstitial page and stops there. A real (headless)
 * browser is the only reliable way to land on the actual publisher page,
 * so this drives one to follow the redirect, then pulls the resolved
 * article's own og:description/meta description while the page is right
 * there (skips a second network round-trip, and works even on sites that
 * 403 plain server-side fetches). Returns null if it never leaves
 * news.google.com, so the caller can drop the item — we only ever link to
 * the original source, never a Google redirect.
 */
async function resolveGoogleNewsArticle(browser, googleUrl) {
  const page = await browser.newPage({ userAgent: UA });
  try {
    await page.goto(googleUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    // Google's redirect fires client-side after the interstitial loads —
    // give it a moment to land before giving up on it.
    await page
      .waitForURL((u) => !u.hostname.includes("news.google.com"), { timeout: 8000 })
      .catch(() => {});
    const finalUrl = page.url();
    if (!finalUrl || finalUrl.includes("news.google.com")) return null;
    const description = await page
      .evaluate(() => {
        const meta =
          document.querySelector('meta[property="og:description"]') ||
          document.querySelector('meta[name="description"]');
        return meta?.getAttribute("content") || "";
      })
      .catch(() => "");
    return { url: finalUrl, description };
  } catch {
    return null;
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Best-effort fallback for items with no real excerpt (mainly Google
 * News-routed items, whose RSS descriptions are just link lists): fetch the
 * article page and pull its og:description / meta description. This is
 * metadata publishers write specifically to be shown as a preview by other
 * sites (search engines, social shares) — a different, much narrower thing
 * than scraping article body text, and still run through the same
 * excerpt() cap. Silently gives up on any failure; a missing preview is a
 * fine fallback, a broken pipeline run is not.
 */
async function fetchMetaDescription(url) {
  try {
    const html = await fetchText(url, { timeoutMs: 8000 });
    const match =
      html.match(/<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']*)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']*)["'][^>]*property=["']og:description["']/i) ||
      html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i);
    if (!match) return "";
    const desc = excerpt(stripHtml(match[1]));
    // Google News article links (news.google.com/rss/articles/...) don't
    // resolve to the publisher's page on a plain HTTP fetch — they land on
    // Google's own interstitial, whose fixed generic description would
    // otherwise get shown as if it were about the story. Reject it rather
    // than display misleading text.
    if (/aggregated from sources all over the world by google news/i.test(desc)) return "";
    return desc;
  } catch {
    return "";
  }
}

export async function fetchNews() {
  const { sources, keywords, maxPerSource, maxTotal } = config.news;
  const all = [];

  // Only spun up if some source actually needs it (see use below) — most
  // runs do, since Google News is both a dedicated source and the fallback
  // for several others whenever their direct feed is down/rate-limited.
  let browser;
  const getBrowser = async () => (browser ??= await chromium.launch());

  try {
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
      const viaGoogleNews = hit.url.includes("news.google.com");
      const candidateCount = Math.min(items.length, maxPerSource);
      const mapped = await Promise.all(items.slice(0, maxPerSource).map(async (it) => {
        // Google News items carry the real publisher in the <source> tag and
        // append " - Publisher" to titles; credit the outlet, not Google.
        const publisher = it.sourceName || src.name;
        const title = viaGoogleNews
          ? it.title.replace(new RegExp(`\\s*[-–|]\\s*${escapeRe(publisher)}\\s*$`, "i"), "")
          : it.title;
        let url = it.link;
        let summary = viaGoogleNews ? "" : excerpt(it.description);
        if (viaGoogleNews) {
          // Only ever link to the original article — if Google's redirect
          // can't be resolved to it, drop the item rather than publish a
          // Google link or a homepage guess.
          const resolved = await resolveGoogleNewsArticle(await getBrowser(), it.link);
          if (!resolved) return null;
          url = resolved.url;
          summary = excerpt(resolved.description);
        }
        return {
          title,
          summary,
          url,
          source: publisher,
          sourceUrl: it.sourceUrl || src.homepage,
          publishedAt: it.publishedAt
        };
      }));
      items = mapped.filter(Boolean);
      const droppedNote = viaGoogleNews && candidateCount > items.length
        ? ` (dropped ${candidateCount - items.length} unresolved Google News link${candidateCount - items.length === 1 ? "" : "s"})`
        : "";
      log(`news: ${src.name} → ${items.length} items (via ${hit.url})${droppedNote}`);
      all.push(...items);
    }
  } finally {
    await browser?.close().catch(() => {});
  }

  // De-dupe near-identical stories (same event covered by many outlets):
  // compare sets of significant title words and drop items that overlap
  // heavily with an already-kept item.
  const words = (t) =>
    new Set(t.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 3));
  const dayOf = (iso) => (iso || "").slice(0, 10);
  const kept = [];
  for (const it of all.sort((a, b) => {
    // Recency still rules day-to-day, but within the same calendar day
    // prefer items with a real preview: a source's direct feed can be
    // temporarily blocked and fall back to the Google News proxy (which
    // never carries body text), and without this a bad run for one or two
    // sources can flood the page with "no preview available" cards.
    const dayCmp = dayOf(b.publishedAt).localeCompare(dayOf(a.publishedAt));
    if (dayCmp !== 0) return dayCmp;
    const summaryCmp = (a.summary ? 0 : 1) - (b.summary ? 0 : 1);
    if (summaryCmp !== 0) return summaryCmp;
    return new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
  })) {
    const w = words(it.title);
    const dup = kept.some((k) => {
      const kw = words(k.title);
      let overlap = 0;
      for (const x of w) if (kw.has(x)) overlap++;
      return overlap / Math.max(1, Math.min(w.size, kw.size)) > 0.6;
    });
    if (!dup) kept.push(it);
    if (kept.length >= maxTotal) break;
  }
  const deduped = kept;

  // Fill in previews for whatever made the final cut with no excerpt yet
  // (mostly Google News-routed items) via each article's own meta
  // description, in parallel so one slow site doesn't stall the run.
  await Promise.all(
    deduped
      .filter((it) => !it.summary)
      .map(async (it) => {
        it.summary = await fetchMetaDescription(it.url);
      })
  );

  // No source text to work with (own excerpt empty, and the article's own
  // meta description came back empty too) means there's nothing for the
  // rewrite pass to write an original summary from — drop it rather than
  // publish a "no preview available" card. Every story on the site should
  // have a real write-up.
  const withText = deduped.filter((it) => it.summary);
  if (withText.length < deduped.length) {
    warn(`news: dropped ${deduped.length - withText.length} item(s) with no source text available for a summary`);
  }

  return writeData("news.json", {
    updatedAt: new Date().toISOString(),
    items: withText
  });
}
