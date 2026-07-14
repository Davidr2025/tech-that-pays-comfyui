import config from "../site.config.mjs";
import { readData, writeData, log, warn } from "./lib/util.mjs";

// Google Places API (New) with a committed monthly cache:
//  - results are stored in src/data/places.json with a fetchedAt stamp
//  - re-fetch only when the cache is older than places.cacheDays
//    (or when run with --force), so quota is never spent on page loads
const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
// NOTE on billing: rating/userRatingCount/regularOpeningHours/websiteUri
// are all Enterprise-tier fields, so this request is already billed at the
// Enterprise SKU ($35/1,000 calls, 1,000 free/month) — adding
// nationalPhoneNumber below doesn't change the tier, it's a free add.
const FIELD_MASK = [
  "places.id", "places.displayName", "places.rating", "places.userRatingCount",
  "places.formattedAddress", "places.regularOpeningHours.weekdayDescriptions",
  "places.googleMapsUri", "places.websiteUri", "places.photos",
  "places.nationalPhoneNumber"
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
      `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=1200&skipHttpRedirect=true&key=${apiKey}`
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

// Hand-rolled slugify (no dependency): lowercase, strip diacritics/punctuation,
// hyphenate. Combined with a short deterministic hash of place_id so URLs
// stay stable across monthly refreshes and unique even if two businesses
// share a name.
function slugify(str) {
  return str
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
function shortId(placeId) {
  let h = 0;
  for (let i = 0; i < placeId.length; i++) h = (h * 31 + placeId.charCodeAt(i)) >>> 0;
  return h.toString(36).padStart(6, "0").slice(-6);
}
function businessSlug(name, placeId) {
  return `${slugify(name) || "business"}-${shortId(placeId)}`;
}

async function toBusiness(apiKey, p, subcategory) {
  const photo = p.photos?.[0]?.name ? await photoUrl(apiKey, p.photos[0].name) : null;
  const name = p.displayName?.text || "";
  return {
    id: p.id,
    slug: businessSlug(name, p.id),
    name,
    rating: p.rating ?? null,
    reviews: p.userRatingCount ?? null,
    address: p.formattedAddress || "",
    phone: p.nationalPhoneNumber || null,
    hours: p.regularOpeningHours?.weekdayDescriptions || [],
    mapsUrl: p.googleMapsUri || "",
    website: p.websiteUri || null,
    photo,
    subcategory: subcategory || null
  };
}

// Every configured query already ends in "Mississauga, Ontario" — inject a
// neighborhood name just before it to get a geographically distinct variant
// (e.g. "best plumbers in Port Credit, Mississauga, Ontario"). "" = city-wide,
// use the query verbatim.
function queryForArea(baseQuery, area) {
  if (!area) return baseQuery;
  return baseQuery.replace(/Mississauga, Ontario$/, `${area}, Mississauga, Ontario`);
}

/**
 * Run one niche's query across every configured area, merge raw results by
 * place_id, drop excluded ids, rank by quality, and cap. Excluded ids are
 * filtered BEFORE the cap so a deleted business's slot is backfilled by the
 * next-best real candidate instead of just shrinking the niche.
 */
async function searchAreaVariants(apiKey, baseQuery, cap, excludedIds) {
  const merged = new Map();
  for (const area of config.places.areas) {
    const q = queryForArea(baseQuery, area);
    try {
      const raw = await searchText(apiKey, q, 20); // Text Search's hard per-call cap
      for (const p of raw) if (p.id && !merged.has(p.id)) merged.set(p.id, p);
    } catch (e) {
      warn(`places: variant "${q}" failed: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return [...merged.values()]
    .filter((p) => !excludedIds.has(p.id))
    .sort(byQuality)
    .slice(0, cap);
}

/**
 * Categories are either:
 *  - simple: { query } → area-split search, top `resultsPerCategory`
 *  - grouped: { subcategories: [{ label, query }], perSubcategory } → one
 *    area-split search PER subcategory, each ranked and capped
 *    independently so every trade/type gets fair shelf space instead of
 *    the highest-rated type crowding out the rest.
 */
async function fetchCategory(apiKey, cat, excludedIds) {
  if (cat.subcategories) {
    const perSub = cat.perSubcategory || 100;
    const businesses = [];
    for (const sub of cat.subcategories) {
      try {
        const top = await searchAreaVariants(apiKey, sub.query, perSub, excludedIds);
        for (const p of top) businesses.push(await toBusiness(apiKey, p, sub.label));
        log(`places: ${cat.label} → ${sub.label}: ${top.length}`);
      } catch (e) {
        warn(`places: ${cat.label} → ${sub.label} failed: ${e.message}`);
      }
    }
    return businesses;
  }
  const cap = cat.resultsPerCategory || config.places.resultsPerCategory;
  const top = await searchAreaVariants(apiKey, cat.query, cap, excludedIds);
  const businesses = [];
  for (const p of top) businesses.push(await toBusiness(apiKey, p, null));
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

  const excluded = readData("excluded-places.json", []);
  const excludedIds = new Set(excluded.map((e) => e.id));
  if (excludedIds.size) log(`places: honoring ${excludedIds.size} excluded business id(s)`);

  const categories = [];
  for (const cat of config.places.categories) {
    try {
      const businesses = await fetchCategory(apiKey, cat, excludedIds);
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
