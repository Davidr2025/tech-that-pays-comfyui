#!/usr/bin/env node
// ============================================================
// Exports the business directory (src/data/places.json) as a flat
// CSV for CRM import / outbound outreach. Each row includes the
// business's live profile page URL on the site so it can be
// referenced directly in "claim your listing" emails.
// Run: npm run export-csv
// ============================================================
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readData, log, warn } from "./lib/util.mjs";

const SITE_URL = (process.env.SITE_URL || "https://mississaugainsider.ca").replace(/\/$/, "");
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "exports");
const OUT_FILE = join(OUT_DIR, "businesses.csv");

const COLUMNS = [
  "name", "category", "subcategory", "address", "phone",
  "rating", "reviews", "website", "profileUrl", "mapsUrl", "placeId"
];

function csvField(value) {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportCsv() {
  const places = readData("places.json");
  if (!places || !Array.isArray(places.categories)) {
    warn("export-csv: places.json missing or malformed — skipping");
    return false;
  }

  const rows = [COLUMNS.join(",")];
  let count = 0;
  for (const cat of places.categories) {
    for (const b of cat.businesses || []) {
      rows.push(COLUMNS.map((col) => csvField({
        name: b.name,
        category: cat.label,
        subcategory: b.subcategory || "",
        address: b.address,
        phone: b.phone,
        rating: b.rating,
        reviews: b.reviews,
        website: b.website,
        profileUrl: `${SITE_URL}/directory/${cat.slug}/${b.slug}/`,
        mapsUrl: b.mapsUrl,
        placeId: b.id
      }[col])).join(","));
      count++;
    }
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, rows.join("\n") + "\n");
  log(`export-csv: wrote ${count} businesses → ${OUT_FILE}`);
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  exportCsv();
}
