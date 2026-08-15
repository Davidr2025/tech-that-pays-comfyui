import { requestIsAuthed } from "../lib/auth.js";
import { TABLES, listRecords } from "../lib/airtable.js";

export const config = { runtime: "edge" };

// Read-only, same reasoning as api/activity.js: this list is written by a
// scheduled check (a Routine re-running list_sessions), not by hand. If
// nothing here is stale, nothing here needs to be more than a reflection of
// what's actually true right now.
export default async function handler(request) {
  if (!(await requestIsAuthed(request, process.env.SESSION_SECRET))) {
    return new Response(JSON.stringify({ error: "Not signed in" }), { status: 401 });
  }
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const records = await listRecords(TABLES.sessionsInbox);
  const items = records
    .map((r) => ({
      id: r.id,
      title: r.fields["Session Title"],
      status: r.fields["Status"],
      needsAction: r.fields["What it needs from you"],
      lastActive: r.fields["Session Last Active"]
    }))
    .sort((a, b) => new Date(a.lastActive) - new Date(b.lastActive)); // oldest-stuck-first

  return new Response(JSON.stringify(items), { status: 200, headers: { "content-type": "application/json" } });
}
