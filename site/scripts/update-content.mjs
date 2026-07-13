#!/usr/bin/env node
// ============================================================
// Mississauga Insider content pipeline
//   feeds fetched → content parsed → data committed → site rebuilt
// Run:  npm run update-content   (add -- --force-places to refresh
//       the Google Places cache regardless of age)
// ============================================================
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, log } from "./lib/util.mjs";
import { fetchNews } from "./fetch-news.mjs";
import { fetchEvents } from "./fetch-events.mjs";
import { fetchWeather } from "./fetch-weather.mjs";
import { fetchSports } from "./fetch-sports.mjs";
import { fetchPlaces } from "./fetch-places.mjs";

const forcePlaces = process.argv.includes("--force-places");

log("=== Mississauga Insider content update starting ===");
const started = Date.now();

const results = {};
for (const [name, fn] of [
  ["news", fetchNews],
  ["events", fetchEvents],
  ["weather", fetchWeather],
  ["sports", fetchSports],
  ["places", () => fetchPlaces({ force: forcePlaces })]
]) {
  try {
    results[name] = await fn();
  } catch (e) {
    console.error(`[pipeline] ERROR in ${name}: ${e.message}`);
    results[name] = false;
  }
}

mkdirSync(DATA_DIR, { recursive: true });
writeFileSync(
  join(DATA_DIR, "meta.json"),
  JSON.stringify({ updatedAt: new Date().toISOString(), results }, null, 2) + "\n"
);

const secs = ((Date.now() - started) / 1000).toFixed(1);
log(`=== done in ${secs}s: ${Object.entries(results).map(([k, v]) => `${k}=${v ? "updated" : "unchanged"}`).join(", ")} ===`);
