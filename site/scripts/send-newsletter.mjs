#!/usr/bin/env node
// ============================================================
// Newsletter sender — pushes the generated issue to Beehiiv via
// the Create Post endpoint (POST /v2/publications/{id}/posts).
//
// NOTE: Beehiiv's Create Post / Send API is currently Enterprise-only
// (beta, granted on request — ask via your beehiiv dashboard chat).
// Until you have it, run with NEWSLETTER_MODE=draft to try a draft,
// or use the generated newsletter/latest.html manually / via the
// beehiiv MCP. Modes:
//   NEWSLETTER_MODE=publish   → send immediately (email + web)
//   NEWSLETTER_MODE=schedule  → schedule for NEWSLETTER_SEND_AT (RFC3339)
//   NEWSLETTER_MODE=draft     → create a draft in beehiiv
//   NEWSLETTER_MODE=dry-run   → print payload, call nothing (default)
// ============================================================
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const meta = JSON.parse(readFileSync(join(ROOT, "newsletter", "latest.json"), "utf8"));
const html = readFileSync(join(ROOT, "newsletter", "latest.html"), "utf8");

const mode = process.env.NEWSLETTER_MODE || "dry-run";
const apiKey = process.env.BEEHIIV_API_KEY;
const pubId = process.env.BEEHIIV_PUBLICATION_ID;

const payload = {
  title: meta.subject,
  subtitle: meta.previewText,
  body_content: html,
  status: mode === "draft" ? "draft" : "confirmed",
  ...(mode === "schedule" && process.env.NEWSLETTER_SEND_AT
    ? { scheduled_at: process.env.NEWSLETTER_SEND_AT }
    : {}),
  email_settings: { preview_text: meta.previewText },
  content_tags: ["weekly", "auto-curated"]
};

console.log(`[send] mode=${mode} subject="${meta.subject}"`);

if (mode === "dry-run") {
  console.log("[send] dry run — payload preview (html omitted):");
  console.log(JSON.stringify({ ...payload, body_content: `<${html.length} chars of HTML>` }, null, 2));
  process.exit(0);
}
if (!apiKey || !pubId) {
  console.error("[send] BEEHIIV_API_KEY / BEEHIIV_PUBLICATION_ID not set — cannot send. The built issue is in site/newsletter/latest.html.");
  process.exit(1);
}

const res = await fetch(`https://api.beehiiv.com/v2/publications/${pubId}/posts`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
  body: JSON.stringify(payload)
});
const body = await res.text();
console.log(`[send] Beehiiv responded HTTP ${res.status}`);
console.log(body.slice(0, 1000));
if (!res.ok) {
  if (res.status === 403 || res.status === 404) {
    console.error(
      "[send] This usually means the Create Post endpoint isn't enabled for your plan " +
        "(it's Enterprise-beta — request access via beehiiv support), or the publication ID is wrong. " +
        "The finished issue is still available at site/newsletter/latest.html."
    );
  }
  process.exit(1);
}
console.log("[send] ✅ post created in beehiiv");
