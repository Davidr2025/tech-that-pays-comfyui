import { requestIsAuthed } from "../lib/auth.js";
import { listRecordsFromBase } from "../lib/airtable.js";

export const config = { runtime: "edge" };

const VIDEO_BASE_ID = "appKvNW8liQGtejmQ"; // LSFG Video Pipeline
const VIDEOS_TABLE_ID = "tblgYODJ8JaNsdQ06"; // Videos

const money = (v) => {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export default async function handler(request) {
  if (!(await requestIsAuthed(request, process.env.SESSION_SECRET))) {
    return new Response(JSON.stringify({ error: "Not signed in" }), { status: 401 });
  }

  const records = await listRecordsFromBase(VIDEO_BASE_ID, VIDEOS_TABLE_ID);

  const byStatus = {};
  let actualSpend = 0;
  let estimatedSpend = 0;
  let published = 0;
  let totalLeads = 0;
  const recent = [];

  for (const r of records) {
    const f = r.fields;
    const title = f["Video Title"];
    if (!title) continue; // a few blank placeholder rows exist in this table
    const status = f["Status"] || "Unlabeled";
    byStatus[status] = (byStatus[status] || 0) + 1;
    actualSpend += money(f["Actual Total Cost"]);
    estimatedSpend += money(f["Estimated Total Cost"]);
    totalLeads += money(f["Leads Generated"]);
    if (f["Published At"]) {
      published += 1;
      recent.push({ title, publishedAt: f["Published At"], url: f["YouTube URL"] || null, views: money(f["Views (7-day)"]) });
    }
  }
  recent.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  const total = Object.values(byStatus).reduce((s, n) => s + n, 0);

  return new Response(
    JSON.stringify({
      total,
      byStatus,
      published,
      actualSpend,
      estimatedSpend,
      totalLeads,
      recentlyPublished: recent.slice(0, 5)
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
