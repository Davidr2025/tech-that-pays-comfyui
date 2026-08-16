import { requestIsAuthed } from "../lib/auth.js";
import { TABLES, listRecords, createRecord, updateRecord, deleteRecord } from "../lib/airtable.js";

export const config = { runtime: "edge" };

const FIELD = { source: "Source", business: "Business", month: "Month", traffic: "Traffic", leads: "Leads", offers: "Offers", sales: "Sales" };

function toJson(record) {
  const f = record.fields;
  return {
    id: record.id,
    source: f[FIELD.source] ?? null,
    businessId: f[FIELD.business]?.[0] ?? null,
    month: f[FIELD.month] ?? null,
    traffic: f[FIELD.traffic] ?? 0,
    leads: f[FIELD.leads] ?? 0,
    offers: f[FIELD.offers] ?? 0,
    sales: f[FIELD.sales] ?? 0
  };
}

export default async function handler(request) {
  if (!(await requestIsAuthed(request, process.env.SESSION_SECRET))) {
    return new Response(JSON.stringify({ error: "Not signed in" }), { status: 401 });
  }

  if (request.method === "GET") {
    const records = await listRecords(TABLES.leadSources);
    return json(records.map(toJson));
  }

  if (request.method === "POST") {
    const body = await request.json();
    if (!body.businessId || !body.month || !body.source) return json({ error: "businessId, month, and source are required" }, 400);

    // One row per business+month+source -- logging the same one again corrects it in place.
    const all = await listRecords(TABLES.leadSources);
    const existing = all.find(
      (r) =>
        r.fields[FIELD.business]?.[0] === body.businessId &&
        r.fields[FIELD.month] === body.month &&
        r.fields[FIELD.source] === body.source
    );

    const fields = {
      [FIELD.source]: body.source,
      [FIELD.business]: [body.businessId],
      [FIELD.month]: body.month,
      [FIELD.traffic]: body.traffic ?? 0,
      [FIELD.leads]: body.leads ?? 0,
      [FIELD.offers]: body.offers ?? 0,
      [FIELD.sales]: body.sales ?? 0
    };

    const record = existing ? await updateRecord(TABLES.leadSources, existing.id, fields) : await createRecord(TABLES.leadSources, fields);
    return json(toJson(record), existing ? 200 : 201);
  }

  if (request.method === "DELETE") {
    const body = await request.json();
    if (!body.id) return json({ error: "id is required" }, 400);
    await deleteRecord(TABLES.leadSources, body.id);
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, 405);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
