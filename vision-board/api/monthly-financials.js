import { requestIsAuthed } from "../lib/auth.js";
import { TABLES, listRecords, createRecord, updateRecord, deleteRecord, logActivity } from "../lib/airtable.js";

export const config = { runtime: "edge" };

const FIELD = {
  month: "Month",
  business: "Business",
  income: "Income",
  expenses: "Expenses",
  notes: "Notes",
  traffic: "Traffic",
  leads: "Leads",
  offers: "Offers",
  sales: "Sales"
};

function toJson(record) {
  const f = record.fields;
  return {
    id: record.id,
    month: f[FIELD.month] ?? null,
    businessId: f[FIELD.business]?.[0] ?? null,
    income: f[FIELD.income] ?? 0,
    expenses: f[FIELD.expenses] ?? 0,
    notes: f[FIELD.notes] ?? null,
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
    const records = await listRecords(TABLES.monthlyFinancials);
    return json(records.map(toJson));
  }

  if (request.method === "POST") {
    const body = await request.json();
    if (!body.businessId || !body.month) return json({ error: "businessId and month are required" }, 400);

    // One entry per business per month -- logging the same month again corrects it in place.
    const all = await listRecords(TABLES.monthlyFinancials);
    const existing = all.find((r) => r.fields[FIELD.business]?.[0] === body.businessId && r.fields[FIELD.month] === body.month);

    const fields = {
      [FIELD.month]: body.month,
      [FIELD.business]: [body.businessId],
      [FIELD.income]: body.income ?? 0,
      [FIELD.expenses]: body.expenses ?? 0,
      [FIELD.notes]: body.notes || null,
      [FIELD.traffic]: body.traffic ?? 0,
      [FIELD.leads]: body.leads ?? 0,
      [FIELD.offers]: body.offers ?? 0,
      [FIELD.sales]: body.sales ?? 0
    };

    const record = existing ? await updateRecord(TABLES.monthlyFinancials, existing.id, fields) : await createRecord(TABLES.monthlyFinancials, fields);
    await logActivity(`Logged ${body.month} financials`, existing ? "Edited" : "Added");
    return json(toJson(record), existing ? 200 : 201);
  }

  if (request.method === "DELETE") {
    const body = await request.json();
    if (!body.id) return json({ error: "id is required" }, 400);
    await deleteRecord(TABLES.monthlyFinancials, body.id);
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, 405);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
