import { requestIsAuthed } from "../lib/auth.js";
import { TABLES, listRecords } from "../lib/airtable.js";

export const config = { runtime: "edge" };

// Read-only, refreshed by a scheduled check -- see Usage Snapshot table
// description in Airtable. Best-effort: this reads Claude Code session
// metadata as a proxy for account-wide usage, not an official usage API,
// so treat it as approximate, not precise.
export default async function handler(request) {
  if (!(await requestIsAuthed(request, process.env.SESSION_SECRET))) {
    return new Response(JSON.stringify({ error: "Not signed in" }), { status: 401 });
  }
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const records = await listRecords(TABLES.usageSnapshot);
  const latest = records
    .map((r) => ({
      checkedAt: r.fields["Checked At"],
      rateLimitType: r.fields["Rate Limit Type"],
      status: r.fields["Status"],
      resetsAt: r.fields["Resets At"],
      note: r.fields["Note"]
    }))
    .sort((a, b) => new Date(b.checkedAt) - new Date(a.checkedAt))[0] || null;

  return new Response(JSON.stringify(latest), { status: 200, headers: { "content-type": "application/json" } });
}
