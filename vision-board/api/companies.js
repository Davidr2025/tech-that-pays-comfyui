import { requestIsAuthed } from "../lib/auth.js";
import { TABLES, listRecords, createRecord, updateRecord } from "../lib/airtable.js";

export const config = { runtime: "edge" };

const FIELD = { name: "Name", sortOrder: "Sort Order" };

function toJson(record) {
  const f = record.fields;
  return { id: record.id, name: f[FIELD.name] ?? null, sortOrder: f[FIELD.sortOrder] ?? 0 };
}

export default async function handler(request) {
  if (!(await requestIsAuthed(request, process.env.SESSION_SECRET))) {
    return new Response(JSON.stringify({ error: "Not signed in" }), { status: 401 });
  }

  if (request.method === "GET") {
    const records = await listRecords(TABLES.companies);
    return json(records.map(toJson));
  }

  // Used the first time a business names a company that isn't in this table yet --
  // appended just before "General", which always stays last.
  if (request.method === "POST") {
    const body = await request.json();
    if (!body.name) return json({ error: "name is required" }, 400);
    const all = await listRecords(TABLES.companies);
    const existing = all.find((r) => r.fields[FIELD.name] === body.name);
    if (existing) return json(toJson(existing));
    const nonGeneral = all.filter((r) => r.fields[FIELD.name] !== "General");
    const nextOrder = nonGeneral.length ? Math.max(...nonGeneral.map((r) => r.fields[FIELD.sortOrder] ?? 0)) + 1 : 0;
    const record = await createRecord(TABLES.companies, { [FIELD.name]: body.name, [FIELD.sortOrder]: nextOrder });
    return json(toJson(record), 201);
  }

  if (request.method === "PATCH") {
    const body = await request.json();
    if (!body.id || body.sortOrder === undefined) return json({ error: "id and sortOrder are required" }, 400);
    const record = await updateRecord(TABLES.companies, body.id, { [FIELD.sortOrder]: body.sortOrder });
    return json(toJson(record));
  }

  return json({ error: "Method not allowed" }, 405);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
