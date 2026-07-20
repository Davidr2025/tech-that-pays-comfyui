#!/usr/bin/env node
// ============================================================
// Exports the business directory (src/data/places.json) as CSV for
// CRM import / outbound outreach. Each row includes the business's
// live profile page URL on the site so it can be referenced
// directly in "claim your listing" emails.
//
// Writes two things:
//  - exports/businesses.csv — the full combined file (one download)
//  - exports/by-category/<slug>[-N].csv — the same data chunked by
//    category (and further split if a category exceeds CHUNK_SIZE
//    rows) so each file is small enough to hand to a Drive-upload
//    step one at a time, and so outreach can be organized by
//    category.
// Run: npm run export-csv
// ============================================================
import { writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readData, log, warn } from "./lib/util.mjs";

const SITE_URL = (process.env.SITE_URL || "https://mississaugainsider.ca").replace(/\/$/, "");
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "exports");
const OUT_FILE = join(OUT_DIR, "businesses.csv");
const BY_CAT_DIR = join(OUT_DIR, "by-category");
const CHUNK_SIZE = 150; // keeps each file well within a single upload step

const COLUMNS = [
  "name", "category", "subcategory", "address", "phone",
  "rating", "reviews", "website", "profileUrl", "placeId"
];

function csvField(value) {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toRow(cat, b) {
  return COLUMNS.map((col) => csvField({
    name: b.name,
    category: cat.label,
    subcategory: b.subcategory || "",
    address: b.address,
    phone: b.phone,
    rating: b.rating,
    reviews: b.reviews,
    website: b.website,
    profileUrl: `${SITE_URL}/directory/${cat.slug}/${b.slug}/`,
    placeId: b.id
  }[col])).join(",");
}

export function exportCsv() {
  const places = readData("places.json");
  if (!places || !Array.isArray(places.categories)) {
    warn("export-csv: places.json missing or malformed — skipping");
    return false;
  }

  const header = COLUMNS.join(",");
  const allRows = [header];
  let total = 0;

  if (existsSync(BY_CAT_DIR)) rmSync(BY_CAT_DIR, { recursive: true });
  mkdirSync(BY_CAT_DIR, { recursive: true });

  for (const cat of places.categories) {
    const businesses = cat.businesses || [];
    if (!businesses.length) continue;
    const rows = businesses.map((b) => toRow(cat, b));
    allRows.push(...rows);
    total += rows.length;

    const chunks = [];
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) chunks.push(rows.slice(i, i + CHUNK_SIZE));
    chunks.forEach((chunk, i) => {
      const suffix = chunks.length > 1 ? `-${i + 1}` : "";
      const file = join(BY_CAT_DIR, `${cat.slug}${suffix}.csv`);
      writeFileSync(file, [header, ...chunk].join("\n") + "\n");
    });
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, allRows.join("\n") + "\n");
  log(`export-csv: wrote ${total} businesses → ${OUT_FILE} + ${readdirSync(BY_CAT_DIR).length} per-category files`);
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  exportCsv();
}
