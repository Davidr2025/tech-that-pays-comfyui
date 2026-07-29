import { chromium } from "playwright";
import config from "../site.config.mjs";
import {
  fetchText, parseFeed, looksLikeFeed, excerpt, stripHtml, toIso, writeData, readData, log, warn, UA
} from "./lib/util.mjs";

/** WordPress REST API posts endpoint → normalized feed items. */
function parseWpJson(text) {
  const arr = JSON.parse(text);
  if (!Array.isArray(arr)) throw new Error("not a WP REST array");
  return arr.map((p) => ({
    title: stripHtml(p.title?.rendered || ""),
    link: p.link || "",
    publishedAt: toIso(p.date),
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
 * browser is the only reliable way to land on the actual publisher page.
 * Returns the resolved URL, or null if it never leaves news.google.com, so
 * the caller can drop the item — we only ever link to the original
 * source, never a Google redirect.
 */
async function resolveGoogleNewsUrl(page, googleUrl) {
  try {
    await page.goto(googleUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    // Google's redirect fires client-side after the interstitial loads —
    // give it a moment to land before giving up on it.
    await page
      .waitForURL((u) => !u.hostname.includes("news.google.com"), { timeout: 8000 })
      .catch(() => {});
    const finalUrl = page.url();
    return finalUrl && !finalUrl.includes("news.google.com") ? finalUrl : null;
  } catch {
    return null;
  }
}

/**
 * Pull real body-paragraph text from the article's own page — enough raw
 * material for the rewrite pass to write a genuine multi-sentence original
 * summary from, rather than the one-line meta description this used to
 * rely on. Runs for every item (not just Google News-routed ones), since
 * an RSS excerpt is often thinner than the article itself. Falls back to
 * the meta description if the page has no real paragraph content (some
 * sites render articles client-side in ways a quick DOM read won't catch).
 */
async function extractArticleText(page, url) {
  try {
    if (page.url() !== url) {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    }
    const { paragraphs, metaDescription } = await page.evaluate(() => {
      const root = document.querySelector("article") || document.querySelector("main") || document.body;
      const meta =
        document.querySelector('meta[property="og:description"]') ||
        document.querySelector('meta[name="description"]');
      return {
        paragraphs: Array.from(root.querySelectorAll("p"))
          .map((p) => p.innerText.trim())
          .filter((t) => t.length > 40)
          .slice(0, 8),
        metaDescription: meta?.getAttribute("content") || ""
      };
    });
    const bodyText = paragraphs.join("\n\n");
    if (/aggregated from sources all over the world by google news/i.test(metaDescription)) {
      return bodyText;
    }
    return bodyText || metaDescription;
  } catch {
    return "";
  }
}

export async function fetchNews() {
  const { sources, keywords, maxPerSource, maxTotal } = config.news;
  const all = [];

  // Launched once and reused for both Google News redirect resolution and
  // the body-text extraction pass below — most runs need it for at least
  // one source, since Google News is both a dedicated source and the
  // fallback for several others whenever their direct feed is down.
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
        if (viaGoogleNews) {
          // Only ever link to the original article — if Google's redirect
          // can't be resolved to it, drop the item rather than publish a
          // Google link or a homepage guess.
          const page = await (await getBrowser()).newPage({ userAgent: UA });
          const resolved = await resolveGoogleNewsUrl(page, it.link).finally(() => page.close().catch(() => {}));
          if (!resolved) return null;
          url = resolved;
        }
        return {
          title,
          rawText: excerpt(it.description, 2000), // fallback raw material if body extraction below comes up short
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

    // De-dupe near-identical stories (same event covered by many outlets):
    // compare sets of significant title words and drop items that overlap
    // heavily with an already-kept item.
    const words = (t) =>
      new Set(t.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 3));
    const dayOf = (iso) => (iso || "").slice(0, 10);
    const kept = [];
    for (const it of all.sort((a, b) => {
      const dayCmp = dayOf(b.publishedAt).localeCompare(dayOf(a.publishedAt));
      if (dayCmp !== 0) return dayCmp;
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

    // Pull real article body text for whatever made the final cut — only
    // now, after de-duping, so we're not paying for a page visit on
    // candidates we're about to throw away. This is the raw material the
    // rewrite pass needs to write a genuine multi-sentence original
    // summary; a thin RSS excerpt alone isn't enough for that.
    await Promise.all(
      deduped.map(async (it) => {
        const page = await (await getBrowser()).newPage({ userAgent: UA });
        try {
          const bodyText = await extractArticleText(page, it.url);
          it.summary = excerpt(bodyText || it.rawText, 2000);
        } finally {
          await page.close().catch(() => {});
        }
        delete it.rawText;
      })
    );

    // No source text to work with means there's nothing for the rewrite
    // pass to write an original summary from — drop it rather than
    // publish a "no preview available" card. Every story on the site
    // should have a real write-up.
    const withText = deduped.filter((it) => it.summary);
    if (withText.length < deduped.length) {
      warn(`news: dropped ${deduped.length - withText.length} item(s) with no source text available for a summary`);
    }

    // A story often keeps appearing in the feeds run after run while it's
    // still current. Without this, every 6-hour re-fetch would overwrite
    // an already-rewritten item's title/summary/`rewritten` flag with the
    // source's raw wording again, silently un-publishing it until someone
    // re-does the rewrite pass. Match by URL against whatever's already on
    // disk and, for any item that was already rewritten, keep that
    // rewritten title/summary instead of the freshly fetched raw text —
    // only genuinely new URLs come through unrewritten.
    const existingByUrl = new Map((readData("news.json")?.items || []).map((it) => [it.url, it]));
    const merged = withText.map((it) => {
      const prev = existingByUrl.get(it.url);
      return prev?.rewritten
        ? { ...it, title: prev.title, summary: prev.summary, rewritten: true }
        : it;
    });
    const carriedOver = merged.filter((it) => it.rewritten).length;
    if (carriedOver > 0) log(`news: carried forward ${carriedOver} already-rewritten item(s) still present in the feeds`);

    return writeData("news.json", {
      updatedAt: new Date().toISOString(),
      items: merged
    });
  } finally {
    await browser?.close().catch(() => {});
  }
}
