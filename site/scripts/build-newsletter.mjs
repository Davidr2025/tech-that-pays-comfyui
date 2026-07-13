#!/usr/bin/env node
// ============================================================
// Newsletter generator — composes a complete, branded weekly
// issue of Mississauga Insider from the site's data files.
// Output: site/newsletter/latest.html (email-safe HTML)
//         site/newsletter/latest.json (subject, preview text, html)
// Run:    npm run build-newsletter
// ============================================================
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import config from "../site.config.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = (f) => JSON.parse(readFileSync(join(ROOT, "src", "data", f), "utf8"));

const news = DATA("news.json");
const events = DATA("events.json");
const weather = DATA("weather.json");
const featured = DATA("featured-business.json");

const c = config.colors;
const SITE_URL = process.env.SITE_URL || "https://davidr2025.github.io/tech-that-pays-comfyui";
const UTM = "utm_source=newsletter&utm_medium=email&utm_campaign=weekly";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const link = (url) => url + (url.includes("?") ? "&" : "?") + UTM;
const fmtDate = (d, opts) =>
  new Date(d).toLocaleDateString("en-CA", { timeZone: "America/Toronto", ...opts });

// ---------- pick content ----------
const topNews = news.items.slice(0, 6);
const now = Date.now();
const topEvents = events.items
  .filter((e) => new Date(e.end || e.start) >= new Date(now))
  .slice(0, 6);
const openingWords = /\b(open(s|ing|ed)?|launch(es|ed|ing)?|debuts?|coming to|new (restaurant|store|shop|café|cafe|location|park|business))\b/i;
const openings = news.items.filter((it) => openingWords.test(it.title)).slice(0, 2);

const issueDate = fmtDate(new Date(), { month: "long", day: "numeric", year: "numeric" });
const subject = topNews[0]
  ? `🏙️ ${config.city} this week: ${topNews[0].title.slice(0, 70)}`
  : `🏙️ The best of ${config.city} this week`;
const previewText = topEvents[0]
  ? `Plus: ${topEvents.length} things to do, starting with ${topEvents[0].title}`
  : `Your weekly ${config.city} briefing — news, events & local gems.`;

// ---------- email-safe building blocks (tables + inline CSS) ----------
const h2 = (text) => `
  <tr><td style="padding:28px 24px 10px">
    <h2 style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:1.25;color:${c.text};">${esc(text)}</h2>
  </td></tr>`;

const newsItem = (it) => `
  <tr><td style="padding:10px 24px">
    <a href="${esc(link(it.url))}" style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.35;color:${c.primary};font-weight:bold;text-decoration:none;">${esc(it.title)}</a>
    ${it.summary ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:${c.muted};padding-top:4px;">${esc(it.summary)}</div>` : ""}
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${c.muted};padding-top:4px;">
      via <a href="${esc(it.sourceUrl)}" style="color:${c.muted};">${esc(it.source)}</a>${it.publishedAt ? ` · ${fmtDate(it.publishedAt, { month: "short", day: "numeric" })}` : ""}
      &nbsp;·&nbsp;<a href="${esc(link(it.url))}" style="color:${c.primary};">Read the full story →</a>
    </div>
  </td></tr>`;

const eventItem = (e) => `
  <tr><td style="padding:10px 24px">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
      <td width="56" valign="top" style="background:#eef3f9;border-radius:8px;text-align:center;padding:6px 0;">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${c.primary};font-weight:bold;text-transform:uppercase;">${fmtDate(e.start, { month: "short" })}</div>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:20px;color:${c.primary};font-weight:bold;">${fmtDate(e.start, { day: "numeric" })}</div>
      </td>
      <td style="padding-left:12px;">
        <a href="${esc(link(e.url))}" style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:${c.text};font-weight:bold;text-decoration:none;">${esc(e.title)}</a>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${c.muted};padding-top:2px;">
          ${new Date(e.start).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit", timeZone: "America/Toronto" })}${e.venue ? ` · ${esc(e.venue)}` : ""}
        </div>
      </td>
    </tr></table>
  </td></tr>`;

const weatherStrip = weather.current
  ? `<tr><td style="padding:14px 24px;background:#f0f5fb;">
      <span style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${c.text};">
        <b>${weather.current.icon} ${weather.current.temp}°C ${esc(weather.current.text)}</b> in ${config.city} right now ·
        ${weather.days.slice(1, 4).map((d) => `${fmtDate(d.date + "T12:00:00", { weekday: "short" })} ${d.icon} ${d.max}°`).join(" &nbsp; ")}
      </span>
    </td></tr>`
  : "";

const featuredBlock = featured.enabled
  ? `${h2("⭐ Featured Business")}
  <tr><td style="padding:10px 24px">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#fdf6e7;border:1px solid #f0d9a8;border-radius:10px;">
      <tr><td style="padding:18px 20px;">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:1px;color:#8a6d1f;font-weight:bold;text-transform:uppercase;padding-bottom:6px;">Sponsored</div>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:17px;color:${c.text};font-weight:bold;">${esc(featured.name)}</div>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:${c.muted};padding:6px 0 12px;">${esc(featured.description)}</div>
        ${featured.website ? `<a href="${esc(featured.website)}" style="display:inline-block;background:${c.primary};color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;text-decoration:none;padding:10px 18px;border-radius:8px;">${esc(featured.cta || "Learn more")} →</a>` : ""}
      </td></tr>
    </table>
  </td></tr>`
  : "";

const html = `
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${c.bg};">
<tr><td align="center" style="padding:16px 8px;">
<table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;">

  <tr><td style="background:${c.primaryDark};padding:22px 24px;">
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:bold;color:#ffffff;">${esc(config.name.replace(" Insider", ""))}<span style="color:${c.accent};"> Insider</span></div>
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#c7d6e6;padding-top:4px;">Your weekly ${config.city} briefing · ${issueDate}</div>
  </td></tr>

  ${weatherStrip}

  ${h2("📰 Top News")}
  ${topNews.map(newsItem).join("")}
  <tr><td style="padding:6px 24px 0"><a href="${SITE_URL}/news/?${UTM}" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${c.primary};">All the week's headlines on the site →</a></td></tr>

  ${topEvents.length ? `${h2("🎉 Top Things to Do")}${topEvents.map(eventItem).join("")}
  <tr><td style="padding:6px 24px 0"><a href="${SITE_URL}/events/?${UTM}" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${c.primary};">Full events calendar →</a></td></tr>` : ""}

  ${featuredBlock}

  ${openings.length ? `${h2(`🆕 New in ${config.city}`)}${openings.map(newsItem).join("")}` : ""}

  <tr><td style="padding:26px 24px;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${c.primaryDark};border-radius:10px;">
      <tr><td style="padding:18px 20px;text-align:center;">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#ffffff;font-weight:bold;">Know a business that belongs in front of ${config.city}?</div>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#c7d6e6;padding:4px 0 12px;">Featured spots &amp; directory placements are open.</div>
        <a href="${SITE_URL}/advertise/?${UTM}" style="display:inline-block;background:${c.accent};color:#1f1300;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;text-decoration:none;padding:10px 18px;border-radius:8px;">Advertise with us →</a>
      </td></tr>
    </table>
  </td></tr>

  <tr><td style="padding:0 24px 26px;text-align:center;">
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:${c.muted};">
      Headlines &amp; events are curated excerpts — every story is credited and linked to its original source.<br/>
      Curated automatically by <a href="${SITE_URL}/?${UTM}" style="color:${c.muted};">${esc(config.name)}</a> · Mississauga, Ontario
    </div>
  </td></tr>

</table>
</td></tr>
</table>`;

const outDir = join(ROOT, "newsletter");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "latest.html"), html.trim() + "\n");
writeFileSync(
  join(outDir, "latest.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      subject,
      previewText,
      stats: { news: topNews.length, events: topEvents.length, openings: openings.length },
      htmlFile: "latest.html"
    },
    null,
    2
  ) + "\n"
);
console.log(`[newsletter] built issue "${subject}"`);
console.log(`[newsletter] sections: ${topNews.length} news · ${topEvents.length} events · featured=${featured.enabled} · openings=${openings.length}`);
console.log(`[newsletter] wrote newsletter/latest.html + latest.json`);
