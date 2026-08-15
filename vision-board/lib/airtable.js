// Thin wrapper around the Airtable REST API. Every Vision Board record
// lives in Airtable itself (base "LSFG Coaching") — this file is the only
// place that holds the API token, so it never reaches the browser.
//
// Base + table IDs are stable Airtable identifiers (not display names),
// safe to hardcode: renaming a table in the Airtable UI later won't break
// this. Field values are addressed by their human-readable names, which
// Airtable's REST API accepts directly.

const BASE_ID = "appnQS8Fuxs1Kyjjh"; // LSFG Coaching

export const TABLES = {
  projects: "tblzcueShApXTI31K", // Businesses
  notes: "tbl6H345p485TNk6I", // Scratchpad Notes
  activity: "tblA2CAff5jutYwIJ" // Vision Board Activity
};

function airtableUrl(tableId, query = "", baseId = BASE_ID) {
  return `https://api.airtable.com/v0/${baseId}/${tableId}${query}`;
}

/** Read-only access to a different base for a project's CEO view (e.g. the
 * LSFG Video Pipeline base for Tech That Pays). Vision Board writes only
 * ever happen against the main LSFG Coaching base above. */
export async function listRecordsFromBase(baseId, tableId) {
  let records = [];
  let offset;
  do {
    const qs = `?pageSize=100${offset ? `&offset=${offset}` : ""}`;
    const page = await airtableFetch(airtableUrl(tableId, qs, baseId));
    records = records.concat(page.records);
    offset = page.offset;
  } while (offset);
  return records;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Airtable rate-limits per base (a handful of requests/second) and answers a
// burst with 429 rather than queuing it. A personal dashboard with no
// auto-refresh is very unlikely to hit that on its own, but two people
// clicking at once could -- so instead of that click just failing, wait and
// retry a few times before giving up for real.
async function airtableFetch(url, options = {}, attempt = 0) {
  const pat = process.env.AIRTABLE_PAT;
  if (!pat) throw new Error("AIRTABLE_PAT is not set");
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${pat}`,
      "Content-Type": "application/json",
      ...options.headers
    }
  });

  if (res.status === 429 && attempt < 3) {
    const retryAfter = Number(res.headers.get("retry-after"));
    const delayMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt;
    await sleep(delayMs);
    return airtableFetch(url, options, attempt + 1);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Airtable ${options.method || "GET"} ${res.status}: ${body}`);
  }
  return res.json();
}

/** List every record in a table, newest-first by default. Airtable paginates
 * at 100 records/page — this walks every page so nothing gets silently cut off. */
export async function listRecords(tableId, { sort } = {}) {
  let records = [];
  let offset;
  const sortQs = sort ? `&sort[0][field]=${encodeURIComponent(sort.field)}&sort[0][direction]=${sort.direction || "desc"}` : "";
  do {
    const qs = `?pageSize=100${sortQs}${offset ? `&offset=${offset}` : ""}`;
    const page = await airtableFetch(airtableUrl(tableId, qs));
    records = records.concat(page.records);
    offset = page.offset;
  } while (offset);
  return records;
}

export async function getRecord(tableId, id) {
  return airtableFetch(airtableUrl(tableId, `/${id}`));
}

export async function createRecord(tableId, fields) {
  const body = JSON.stringify({ records: [{ fields }], typecast: true });
  const data = await airtableFetch(airtableUrl(tableId), { method: "POST", body });
  return data.records[0];
}

export async function updateRecord(tableId, id, fields) {
  const body = JSON.stringify({ records: [{ id, fields }], typecast: true });
  const data = await airtableFetch(airtableUrl(tableId), { method: "PATCH", body });
  return data.records[0];
}

export async function deleteRecord(tableId, id) {
  await airtableFetch(airtableUrl(tableId, `?records[]=${id}`), { method: "DELETE" });
}

/** Every mutation elsewhere in the app calls this so Recent Activity is
 * always a true record of what happened — never something the UI has to
 * remember to log separately (and can't forget to, either). */
export async function logActivity(message, type) {
  try {
    await createRecord(TABLES.activity, { Message: message, Type: type });
  } catch (err) {
    // Never let an activity-log failure block the real mutation that triggered it.
    console.error("logActivity failed:", err.message);
  }
}
