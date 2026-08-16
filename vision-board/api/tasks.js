import { requestIsAuthed } from "../lib/auth.js";
import { TABLES, listRecords, createRecord, updateRecord, deleteRecord, logActivity } from "../lib/airtable.js";

export const config = { runtime: "edge" };

const FIELD = { task: "Task", business: "Business", done: "Done" };

function toJson(record) {
  const f = record.fields;
  return { id: record.id, task: f[FIELD.task] ?? null, businessId: f[FIELD.business]?.[0] ?? null, done: !!f[FIELD.done] };
}

export default async function handler(request) {
  if (!(await requestIsAuthed(request, process.env.SESSION_SECRET))) {
    return new Response(JSON.stringify({ error: "Not signed in" }), { status: 401 });
  }

  if (request.method === "GET") {
    const records = await listRecords(TABLES.tasks);
    return json(records.map(toJson));
  }

  if (request.method === "POST") {
    const body = await request.json();
    if (!body.businessId || !body.task) return json({ error: "businessId and task are required" }, 400);
    const record = await createRecord(TABLES.tasks, { [FIELD.task]: body.task, [FIELD.business]: [body.businessId] });
    return json(toJson(record), 201);
  }

  if (request.method === "PATCH") {
    const body = await request.json();
    if (!body.id) return json({ error: "id is required" }, 400);
    const fields = {};
    if (body.task !== undefined) fields[FIELD.task] = body.task;
    if (body.done !== undefined) fields[FIELD.done] = body.done;
    const record = await updateRecord(TABLES.tasks, body.id, fields);
    return json(toJson(record));
  }

  if (request.method === "DELETE") {
    const body = await request.json();
    if (!body.id) return json({ error: "id is required" }, 400);
    await deleteRecord(TABLES.tasks, body.id);
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, 405);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
