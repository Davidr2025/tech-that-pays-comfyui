import { requestIsAuthed } from "../lib/auth.js";
import { TABLES, listRecords, getRecord, updateRecord, logActivity } from "../lib/airtable.js";

export const config = { runtime: "edge" };

const FIELD = { num: "Num", project: "Project", status: "Status" };

function toJson(record) {
  const f = record.fields;
  return { id: record.id, num: f[FIELD.num] ?? null, project: f[FIELD.project] ?? null, status: f[FIELD.status] ?? null };
}

export default async function handler(request) {
  if (!(await requestIsAuthed(request, process.env.SESSION_SECRET))) {
    return new Response(JSON.stringify({ error: "Not signed in" }), { status: 401 });
  }

  if (request.method === "GET") {
    const records = await listRecords(TABLES.projectTracker);
    const items = records.map(toJson).sort((a, b) => (a.num || "").localeCompare(b.num || ""));
    return json(items);
  }

  if (request.method === "PATCH") {
    const body = await request.json();
    if (!body.id || !body.status) return json({ error: "id and status are required" }, 400);

    const before = await getRecord(TABLES.projectTracker, body.id);
    const name = before?.fields?.[FIELD.project] || "Untitled";

    const record = await updateRecord(TABLES.projectTracker, body.id, { [FIELD.status]: body.status });
    await logActivity(`Set '${name}' to ${body.status}`, "Edited");
    return json(toJson(record));
  }

  return json({ error: "Method not allowed" }, 405);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
