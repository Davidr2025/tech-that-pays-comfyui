import { requestIsAuthed } from "../lib/auth.js";
import { TABLES, listRecords } from "../lib/airtable.js";

export const config = { runtime: "edge" };

// Read-only on purpose: every other endpoint writes here as a side effect
// of doing something real. There's no "add activity" button because an
// activity log you can hand-edit isn't a record of what actually happened.
export default async function handler(request) {
  if (!(await requestIsAuthed(request, process.env.SESSION_SECRET))) {
    return new Response(JSON.stringify({ error: "Not signed in" }), { status: 401 });
  }
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const records = await listRecords(TABLES.activity);
  const events = records
    .map((r) => ({ id: r.id, createdTime: r.createdTime, message: r.fields.Message, type: r.fields.Type }))
    .sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime))
    .slice(0, 200);

  return new Response(JSON.stringify(events), { status: 200, headers: { "content-type": "application/json" } });
}
