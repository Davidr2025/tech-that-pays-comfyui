#!/usr/bin/env node
// ============================================================
// CEO dashboard generator — composes a static, real-data business
// dashboard from the site's own data files (directory, claims,
// ad slots, newsletter, content pipeline, guides & spotlights).
// Output: site/dashboard/latest.html (open locally, never deployed —
//         lives outside src/pages and public, same pattern as
//         site/newsletter/latest.html)
// Run:    npm run build-dashboard
// ============================================================
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import config from "../site.config.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = (f) => JSON.parse(readFileSync(join(ROOT, "src", "data", f), "utf8"));
const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const places = DATA("places.json");
const claimed = DATA("claimed-places.json");
const featured = DATA("featured-places.json");
const excluded = DATA("excluded-places.json");
const adSlots = DATA("ad-slots.json");
const meta = DATA("meta.json");
const news = DATA("news.json");
const events = DATA("events.json");
const sports = DATA("sports.json");
let newsletter = null;
try {
  newsletter = JSON.parse(readFileSync(join(ROOT, "newsletter", "latest.json"), "utf8"));
} catch {
  /* no issue composed yet */
}

// ---------- frontmatter (guides & spotlights are content-collection markdown) ----------
function readFrontmatter(dir) {
  let files = [];
  try {
    files = readdirSync(join(ROOT, "src", "content", dir)).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }
  return files.map((file) => {
    const raw = readFileSync(join(ROOT, "src", "content", dir, file), "utf8");
    const fm = {};
    const block = raw.match(/^---\n([\s\S]*?)\n---/);
    if (block) {
      for (const line of block[1].split("\n")) {
        const m = line.match(/^(\w+):\s*"?([^"\n]*)"?\s*$/);
        if (m) fm[m[1]] = m[2];
      }
    }
    return fm;
  });
}
const guides = readFrontmatter("guides");
const spotlights = readFrontmatter("spotlights");

// ---------- directory: real business counts, straight from places.json ----------
const categories = places.categories
  .map((c) => ({ slug: c.slug, label: c.label, count: (c.businesses || []).length }))
  .sort((a, b) => b.count - a.count);
const totalBusinesses = categories.reduce((s, c) => s + c.count, 0);
const maxCategoryCount = Math.max(...categories.map((c) => c.count));

const tradesCategory = places.categories.find((c) => c.slug === "trades");
const tradesSubcats = tradesCategory
  ? Object.entries(
      tradesCategory.businesses.reduce((acc, b) => {
        const k = b.subcategory || "Unspecified";
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {})
    )
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
  : [];
const maxTradesCount = tradesSubcats.length ? Math.max(...tradesSubcats.map((c) => c.count)) : 1;

// ---------- monetization: claims are free (verified badge); paid tiers are
// separate Stripe Payment Links that are still unset in site.config.mjs ----------
const claimedPct = totalBusinesses ? (claimed.length / totalBusinesses) * 100 : 0;
const stripeConfigured = (config.claim?.tiers || []).filter(
  (t) => t.stripeUrl && !t.stripeUrl.startsWith("REPLACE_ME")
);
const adSlotEntries = Object.entries(adSlots).filter(([k]) => k !== "_comment");
const adSlotsFilled = adSlotEntries.filter(([, v]) => v.enabled).length;

// ---------- content pipeline freshness ----------
const daysSince = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
const relTime = (iso) => {
  const d = daysSince(iso);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  return `${d} days ago`;
};
const pipelineFeeds = [
  { key: "news", label: "Local News", detail: `${news.items?.length ?? 0} live headlines`, updatedAt: news.updatedAt },
  { key: "events", label: "Things to Do", detail: `${events.items?.length ?? 0} upcoming events`, updatedAt: events.updatedAt },
  { key: "weather", label: "Weather", detail: "Open-Meteo, no key needed", updatedAt: DATA("weather.json").updatedAt },
  { key: "sports", label: "Local Sports", detail: `${sports.items?.length ?? 0} tracked results`, updatedAt: sports.updatedAt },
  {
    key: "places",
    label: "Business Directory",
    detail: `cached ${config.places.cacheDays}d · refreshes in ${Math.max(config.places.cacheDays - daysSince(places.fetchedAt), 0)}d`,
    updatedAt: places.fetchedAt
  }
];

// ---------- stat tile helper values ----------
const fmt = (n) => n.toLocaleString("en-US");
const generatedAt = new Date();

// ============================================================
// Render
// ============================================================
const barRow = ({ label, count, max, href }) => {
  const pct = max ? Math.max((count / max) * 100, 2) : 2;
  const inner = `
      <div class="bar-label">${esc(label)}</div>
      <div class="bar-track"><div class="bar-fill" style="--w:${pct.toFixed(1)}%"></div></div>
      <div class="bar-value">${fmt(count)}</div>`;
  return href
    ? `<a class="bar-row" href="${esc(href)}" target="_blank" rel="noopener">${inner}</a>`
    : `<div class="bar-row">${inner}</div>`;
};

const statTile = ({ label, value, sub }) => `
  <div class="stat-tile">
    <div class="stat-label">${esc(label)}</div>
    <div class="stat-value">${value}</div>
    ${sub ? `<div class="stat-sub">${sub}</div>` : ""}
  </div>`;

const emptyState = ({ icon, title, body, cta }) => `
  <div class="empty-state">
    <div class="empty-icon">${icon}</div>
    <div class="empty-title">${esc(title)}</div>
    <div class="empty-body">${body}</div>
    ${cta ? `<div class="empty-cta">${cta}</div>` : ""}
  </div>`;

const html = `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(config.name)} — CEO Dashboard</title>
<style>
  :root{
    --page: #0d0d0d;
    --surface: #1a1a19;
    --surface-2: #202020;
    --ink: #ffffff;
    --ink-2: #c3c2b7;
    --muted: #898781;
    --grid: #2c2c2a;
    --baseline: #383835;
    --border: rgba(255,255,255,0.10);
    --blue: #3987e5;
    --blue-dim: #1c3a5e;
    --gold: #c98500;
    --good: #0ca30c;
    --warning: #fab219;
    --critical: #e66767;
  }
  *{box-sizing:border-box}
  html{scroll-behavior:smooth}
  body{
    margin:0;background:var(--page);color:var(--ink);
    font-family:system-ui,-apple-system,"Segoe UI",sans-serif;
    -webkit-font-smoothing:antialiased;
  }
  a{color:inherit}
  .shell{display:flex;min-height:100vh;transition:opacity .25s ease}
  .sidebar{
    width:240px;flex:none;background:var(--surface);border-right:1px solid var(--border);
    position:sticky;top:0;height:100vh;display:flex;flex-direction:column;padding:24px 18px;
  }
  .brand{font-weight:700;font-size:15px;line-height:1.3;margin-bottom:4px}
  .brand span{display:block;font-weight:500;font-size:11px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;margin-top:4px}
  .navlinks{list-style:none;margin:28px 0 0;padding:0;display:flex;flex-direction:column;gap:2px}
  .navlinks a{
    display:block;padding:9px 12px;border-radius:8px;font-size:13.5px;font-weight:500;
    color:var(--ink-2);text-decoration:none;border-left:2px solid transparent;
  }
  .navlinks a:hover{background:var(--surface-2);color:var(--ink)}
  .navlinks a.active{background:var(--surface-2);color:var(--ink);border-left-color:var(--blue)}
  .sidebar .meta{margin-top:auto;font-size:11px;color:var(--muted);line-height:1.6;padding-top:16px;border-top:1px solid var(--border)}
  main{flex:1;min-width:0;padding:32px 40px 80px}
  .topbar{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:32px;flex-wrap:wrap;gap:8px}
  .topbar h1{font-size:20px;margin:0}
  .topbar .sub{font-size:13px;color:var(--muted)}
  section{margin-bottom:52px;scroll-margin-top:24px}
  section h2{font-size:15px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-2);margin:0 0 4px}
  section .section-desc{font-size:13px;color:var(--muted);margin:0 0 18px}
  .kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px}
  .stat-tile{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:18px 20px}
  .stat-label{font-size:12.5px;color:var(--muted);margin-bottom:10px}
  .stat-value{font-size:30px;font-weight:600;letter-spacing:-.01em}
  .stat-sub{font-size:12px;color:var(--ink-2);margin-top:6px;line-height:1.5}
  .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:20px}
  @media (max-width:920px){.grid-2{grid-template-columns:1fr}}
  .card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px 22px}
  .card h3{font-size:13.5px;margin:0 0 14px;color:var(--ink-2);font-weight:600}
  .barlist{display:flex;flex-direction:column;gap:10px}
  .bar-row{display:grid;grid-template-columns:185px 1fr 44px;align-items:center;gap:10px;text-decoration:none;border-radius:6px;padding:2px 4px;margin:-2px -4px}
  .bar-row[href]:hover{background:var(--surface-2)}
  .bar-label{font-size:12.5px;color:var(--ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .bar-track{height:8px;background:var(--baseline);border-radius:4px;overflow:hidden}
  .bar-fill{height:100%;width:0;background:var(--blue);border-radius:4px;transition:width 1s cubic-bezier(.16,1,.3,1)}
  .shell.in .bar-fill{width:var(--w)}
  .bar-value{font-size:12.5px;color:var(--ink);text-align:right;font-variant-numeric:tabular-nums}
  .funnel{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  .funnel-step{flex:1;min-width:150px;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px 18px}
  .funnel-step .n{font-size:26px;font-weight:600}
  .funnel-step .l{font-size:12px;color:var(--muted);margin-top:4px}
  .funnel-step .p{font-size:11.5px;color:var(--ink-2);margin-top:8px;padding-top:8px;border-top:1px solid var(--border)}
  .funnel-arrow{color:var(--muted);font-size:18px;flex:none}
  .status-grid{display:flex;flex-direction:column;gap:1px;border:1px solid var(--border);border-radius:12px;overflow:hidden}
  .status-item{display:flex;align-items:center;gap:12px;padding:13px 18px;background:var(--surface)}
  .dot{width:9px;height:9px;border-radius:50%;flex:none}
  .dot.good{background:var(--good);box-shadow:0 0 0 3px rgba(12,163,12,.15)}
  .dot.neutral{background:var(--muted)}
  .status-item .name{font-size:13.5px;font-weight:500;width:150px;flex:none}
  .status-item .detail{font-size:12.5px;color:var(--muted);flex:1}
  .status-item .when{font-size:12px;color:var(--ink-2);text-align:right;flex:none}
  .empty-state{border:1px dashed var(--border);border-radius:12px;padding:22px 24px;text-align:left}
  .empty-icon{font-size:20px;margin-bottom:8px}
  .empty-title{font-size:14px;font-weight:600;margin-bottom:6px}
  .empty-body{font-size:13px;color:var(--ink-2);line-height:1.6}
  .empty-cta{margin-top:12px;font-size:12.5px;color:var(--blue);font-weight:600}
  .tag{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:2px 8px;border-radius:5px}
  .tag.vip{background:rgba(201,133,0,.18);color:#e0a63a}
  .tag.basic{background:var(--surface-2);color:var(--ink-2)}
  .list-row{display:flex;justify-content:space-between;gap:12px;align-items:baseline;padding:9px 0;border-bottom:1px solid var(--border);font-size:13px}
  .list-row:last-child{border-bottom:none}
  .list-row .t{color:var(--ink)}
  .list-row .m{color:var(--muted);font-size:12px;flex:none}

  /* skeleton (perceived-performance) */
  #skeleton{position:fixed;inset:0;background:var(--page);z-index:50;display:flex;transition:opacity .3s ease}
  #skeleton.out{opacity:0;pointer-events:none}
  .sk-side{width:240px;background:var(--surface);border-right:1px solid var(--border)}
  .sk-main{flex:1;padding:32px 40px}
  .sk-row{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:40px}
  .sk-block{height:88px;border-radius:12px}
  .sk-block.tall{height:220px}
  .sk-block,.sk-side{background-image:linear-gradient(100deg,var(--surface) 30%,var(--surface-2) 50%,var(--surface) 70%);background-size:200% 100%;animation:shimmer 1.4s ease-in-out infinite}
  @keyframes shimmer{to{background-position:-200% 0}}
  .shell{opacity:0}
  .shell.in{opacity:1}
  @media (prefers-reduced-motion: reduce){
    .bar-fill{transition:none}
    .sk-block,.sk-side{animation:none}
    #skeleton,.shell{transition:none}
  }
</style>
</head>
<body>

<div id="skeleton" aria-hidden="true">
  <div class="sk-side"></div>
  <div class="sk-main">
    <div class="sk-row">
      <div class="sk-block"></div><div class="sk-block"></div><div class="sk-block"></div><div class="sk-block"></div>
    </div>
    <div class="sk-row" style="grid-template-columns:1fr 1fr">
      <div class="sk-block tall"></div><div class="sk-block tall"></div>
    </div>
  </div>
</div>

<div class="shell" id="app">
  <nav class="sidebar">
    <div class="brand">🏙️ ${esc(config.name)}<span>CEO Dashboard</span></div>
    <ul class="navlinks">
      <li><a href="#overview" data-nav>Overview</a></li>
      <li><a href="#directory" data-nav>Directory</a></li>
      <li><a href="#monetization" data-nav>Monetization</a></li>
      <li><a href="#pipeline" data-nav>Content Pipeline</a></li>
      <li><a href="#editorial" data-nav>Editorial</a></li>
    </ul>
    <div class="meta">
      Generated ${generatedAt.toLocaleString("en-CA", { timeZone: "America/Toronto", dateStyle: "medium", timeStyle: "short" })}<br>
      Regenerate: <code>npm run build-dashboard</code>
    </div>
  </nav>

  <main>
    <div class="topbar">
      <h1>Business Overview</h1>
      <div class="sub">Every number below is computed live from this repo's own data files — nothing here is a mock.</div>
    </div>

    <section id="overview">
      <h2>Overview</h2>
      <div class="kpi-grid">
        ${statTile({ label: "Directory listings", value: fmt(totalBusinesses), sub: `across ${categories.length} categories + ${tradesSubcats.length} trades specialties` })}
        ${statTile({ label: "Verified listings", value: fmt(claimed.length), sub: `${claimedPct.toFixed(1)}% of the directory claimed` })}
        ${statTile({ label: "Paid placements (MRR)", value: "$0", sub: stripeConfigured.length ? `${stripeConfigured.length} tier(s) live` : "Stripe links not connected yet" })}
        ${statTile({ label: "Guides published", value: fmt(guides.length), sub: "hand-written, evergreen" })}
        ${statTile({ label: "Business spotlights", value: fmt(spotlights.length), sub: `${spotlights.filter((s) => s.tier === "vip").length} VIP · ${spotlights.filter((s) => s.tier === "paid").length} paid · ${spotlights.filter((s) => s.tier === "basic" || !s.tier).length} basic` })}
        ${statTile({ label: "Ad slots sold", value: `${adSlotsFilled}/${adSlotEntries.length}`, sub: "generic display placements" })}
      </div>
    </section>

    <section id="directory">
      <h2>Directory</h2>
      <p class="section-desc">Live counts from <code>src/data/places.json</code>, refreshed monthly by the Google Places pipeline.</p>
      <div class="grid-2">
        <div class="card">
          <h3>Businesses by category</h3>
          <div class="barlist">
            ${categories.map((c) => barRow({ label: c.label, count: c.count, max: maxCategoryCount })).join("")}
          </div>
        </div>
        <div class="card">
          <h3>Trades &amp; Home Services — by specialty</h3>
          <div class="barlist">
            ${tradesSubcats.map((c) => barRow({ label: c.label, count: c.count, max: maxTradesCount })).join("")}
          </div>
        </div>
      </div>
    </section>

    <section id="monetization">
      <h2>Monetization</h2>
      <p class="section-desc">The directory is a lead magnet — this is the real conversion path from free listing to paying customer today.</p>
      <div class="funnel">
        <div class="funnel-step">
          <div class="n">${fmt(totalBusinesses)}</div>
          <div class="l">Businesses listed</div>
        </div>
        <div class="funnel-arrow">→</div>
        <div class="funnel-step">
          <div class="n">${fmt(claimed.length)}</div>
          <div class="l">Claimed (verified, free)</div>
          <div class="p">${claimedPct.toFixed(2)}% of listed</div>
        </div>
        <div class="funnel-arrow">→</div>
        <div class="funnel-step">
          <div class="n">$0</div>
          <div class="l">Paying customers</div>
          <div class="p">0% of claimed</div>
        </div>
      </div>
      <div style="height:20px"></div>
      ${emptyState({
        icon: "💳",
        title: "No revenue is being tracked yet — and that's expected",
        body: `Both claim tiers in <code>site.config.mjs</code> (Featured Listing — ${esc(config.claim.tiers[0].price)}, VIP Spotlight — ${esc(config.claim.tiers[1].price)}) still have placeholder <code>stripeUrl</code> values, and ${adSlotsFilled} of ${adSlotEntries.length} ad slots are sold. The ${claimed.length} claimed listing(s) above proves real demand for the free tier — the next step is wiring a real Stripe Payment Link so a claim can convert.`,
        cta: "→ Create Payment Links in Stripe, paste them into claim.tiers, then a real MRR number belongs here."
      })}
    </section>

    <section id="pipeline">
      <h2>Content Pipeline Health</h2>
      <p class="section-desc">Runs 3×/day via GitHub Actions. "Cached" means the fetcher intentionally skipped — not a failure.</p>
      <div class="status-grid">
        ${pipelineFeeds
          .map((f) => {
            const updated = meta.results[f.key];
            return `<div class="status-item">
              <span class="dot ${updated ? "good" : "neutral"}"></span>
              <span class="name">${esc(f.label)}</span>
              <span class="detail">${esc(f.detail)}</span>
              <span class="when">${updated ? "updated" : "cached"} · ${relTime(f.updatedAt)}</span>
            </div>`;
          })
          .join("")}
      </div>
    </section>

    <section id="editorial">
      <h2>Editorial</h2>
      <div class="grid-2">
        <div class="card">
          <h3>Latest newsletter issue</h3>
          ${
            newsletter
              ? `<div style="font-size:13.5px;font-weight:600;margin-bottom:6px">${esc(newsletter.subject)}</div>
                 <div style="font-size:12.5px;color:var(--ink-2);margin-bottom:14px">${esc(newsletter.previewText)}</div>
                 <div style="display:flex;gap:16px;font-size:12px;color:var(--muted)">
                   <span>${newsletter.stats.news} news</span><span>${newsletter.stats.events} events</span><span>${newsletter.stats.openings} openings</span>
                 </div>`
              : emptyState({
                  icon: "📬",
                  title: "No issue composed yet",
                  body: "Run <code>npm run build-newsletter</code> to compose this week's issue from current content.",
                  cta: null
                })
          }
          <div style="height:14px"></div>
          ${emptyState({
            icon: "👥",
            title: "Subscriber count isn't tracked locally",
            body: "Beehiiv is the source of truth for subscribers and open rates — this dashboard only tracks what the repo itself generates.",
            cta: "→ View live subscriber count in the Beehiiv dashboard."
          })}
        </div>
        <div class="card">
          <h3>Guides &amp; Spotlights</h3>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:2px">Guides (${guides.length})</div>
          ${guides.map((g) => `<div class="list-row"><span class="t">${esc(g.title || "Untitled")}</span><span class="m">${g.publishDate || ""}</span></div>`).join("")}
          <div style="height:16px"></div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:2px">Spotlights (${spotlights.length})</div>
          ${spotlights
            .map(
              (s) =>
                `<div class="list-row"><span class="t">${esc(s.businessName || s.title || "Untitled")} <span class="tag ${s.tier === "basic" || !s.tier ? "basic" : "vip"}">${esc((s.tier || "basic").toUpperCase())}</span></span><span class="m">${s.publishDate || ""}</span></div>`
            )
            .join("")}
        </div>
      </div>
    </section>
  </main>
</div>

<script>
  // Brief skeleton hold: masks the width:0→N% bar-fill flash on first paint
  // (the CSS transition needs one settled frame before the .in class can
  // animate it) instead of showing bars snap-filled with no motion.
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  requestAnimationFrame(function () {
    setTimeout(function () {
      document.getElementById("skeleton").classList.add("out");
      document.getElementById("app").classList.add("in");
    }, reduceMotion ? 0 : 420);
  });

  // Sidebar scrollspy
  var links = Array.prototype.slice.call(document.querySelectorAll("[data-nav]"));
  var sections = links.map(function (a) { return document.querySelector(a.getAttribute("href")); });
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var id = "#" + entry.target.id;
      links.forEach(function (a) { a.classList.toggle("active", a.getAttribute("href") === id); });
    });
  }, { rootMargin: "-40% 0px -55% 0px" });
  sections.forEach(function (s) { if (s) observer.observe(s); });
</script>
</body>
</html>
`;

const outDir = join(ROOT, "dashboard");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "latest.html"), html);
writeFileSync(
  join(outDir, "latest.json"),
  JSON.stringify(
    {
      generatedAt: generatedAt.toISOString(),
      totalBusinesses,
      categories,
      tradesSubcats,
      claimed: claimed.length,
      featuredDemo: featured.length,
      excluded: excluded.length,
      adSlotsFilled,
      adSlotsTotal: adSlotEntries.length,
      guides: guides.length,
      spotlights: spotlights.length,
      pipeline: meta.results
    },
    null,
    2
  ) + "\n"
);
console.log(`[dashboard] ${fmt(totalBusinesses)} businesses · ${claimed.length} claimed · ${adSlotsFilled}/${adSlotEntries.length} ad slots sold · ${guides.length} guides · ${spotlights.length} spotlights`);
console.log(`[dashboard] wrote dashboard/latest.html + latest.json`);
