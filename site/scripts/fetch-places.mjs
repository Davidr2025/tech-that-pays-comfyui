import config from "../site.config.mjs";
import { readData, writeData, log, warn } from "./lib/util.mjs";

// Google Places API (New) with a committed weekly cache:
//  - results are stored in src/data/places.json with a fetchedAt stamp
//  - re-fetch only when the cache is older than places.cacheDays
//    (or when run with --force), so quota is never spent on page loads
const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = [
  "places.id", "places.displayName", "places.rating", "places.userRatingCount",
  "places.formattedAddress", "places.regularOpeningHours.weekdayDescriptions",
  "places.googleMapsUri", "places.websiteUri", "places.photos"
].join(",");

async function searchText(apiKey, query, pageSize) {
  const res = await fetch(SEARCH_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK
    },
    body: JSON.stringify({
      textQuery: query,
      pageSize,
      locationBias: {
        circle: {
          center: { latitude: config.weather.latitude, longitude: config.weather.longitude },
          radius: 15000
        }
      }
    })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  return json.places || [];
}

async function photoUrl(apiKey, photoName) {
  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=640&skipHttpRedirect=true&key=${apiKey}`
    );
    if (!res.ok) return null;
    const json = await res.json();
    return json.photoUri || null;
  } catch {
    return null;
  }
}

const byQuality = (a, b) =>
  (b.rating || 0) - (a.rating || 0) || (b.userRatingCount || 0) - (a.userRatingCount || 0);

async function toBusiness(apiKey, p, subcategory) {
  const photo = p.photos?.[0]?.name ? await photoUrl(apiKey, p.photos[0].name) : null;
  return {
    id: p.id,
    name: p.displayName?.text || "",
    rating: p.rating ?? null,
    reviews: p.userRatingCount ?? null,
    address: p.formattedAddress || "",
    hours: p.regularOpeningHours?.weekdayDescriptions || [],
    mapsUrl: p.googleMapsUri || "",
    website: p.websiteUri || null,
    photo,
    subcategory: subcategory || null
  };
}

/**
 * Categories are either:
 *  - simple: { query } → one Text Search, top `resultsPerCategory`
 *  - grouped: { subcategories: [{ label, query }], perSubcategory } → one
 *    Text Search PER subcategory. This is how a category grows past
 *    Google's 20-results-per-query cap, and it ranks + caps each
 *    subcategory independently so every trade/type gets fair shelf space
 *    instead of the highest-rated type crowding out the rest.
 */
async function fetchCategory(apiKey, cat) {
  if (cat.subcategories) {
    const perSub = cat.perSubcategory || 8;
    const businesses = [];
    for (const sub of cat.subcategories) {
      try {
        const raw = await searchText(apiKey, sub.query, Math.min(20, perSub + 6));
        const top = raw.sort(byQuality).slice(0, perSub);
        for (const p of top) businesses.push(await toBusiness(apiKey, p, sub.label));
        log(`places: ${cat.label} → ${sub.label}: ${top.length}`);
        await new Promise((r) => setTimeout(r, 250));
      } catch (e) {
        warn(`places: ${cat.label} → ${sub.label} failed: ${e.message}`);
      }
    }
    return businesses;
  }
  const raw = await searchText(apiKey, cat.query, config.places.resultsPerCategory);
  const businesses = [];
  for (const p of raw) businesses.push(await toBusiness(apiKey, p, null));
  return businesses;
}

export async function fetchPlaces({ force = false } = {}) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const existing = readData("places.json");

  if (!apiKey) {
    log("places: GOOGLE_PLACES_API_KEY not set — keeping existing directory data");
    return false;
  }

  if (!force && existing?.fetchedAt) {
    const ageDays = (Date.now() - new Date(existing.fetchedAt)) / 86400_000;
    if (ageDays < config.places.cacheDays && !existing.sampleData) {
      log(`places: cache is ${ageDays.toFixed(1)} days old (< ${config.places.cacheDays}) — skipping refresh`);
      return false;
    }
  }

  const categories = [];
  for (const cat of config.places.categories) {
    try {
      const businesses = await fetchCategory(apiKey, cat);
      if (businesses.length === 0) throw new Error("0 results across all queries");
      categories.push({ slug: cat.slug, label: cat.label, businesses });
      log(`places: ${cat.label} → ${businesses.length} businesses total`);
      await new Promise((r) => setTimeout(r, 250));
    } catch (e) {
      warn(`places: ${cat.label} failed: ${e.message}`);
      const prev = existing?.categories?.find((c) => c.slug === cat.slug);
      if (prev) categories.push(prev);
    }
  }

  const total = categories.reduce((n, c) => n + c.businesses.length, 0);
  if (total === 0) {
    warn("places: nothing fetched — keeping existing data");
    return false;
  }
  return writeData("places.json", {
    fetchedAt: new Date().toISOString(),
    sampleData: false,
    attribution: "Business data & photos from Google Maps",
    categories
  }, { keepOldIfEmpty: false });
}
