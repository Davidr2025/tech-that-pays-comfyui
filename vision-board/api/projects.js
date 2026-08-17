import { requestIsAuthed } from "../lib/auth.js";
import { TABLES, listRecords, getRecord, createRecord, updateRecord, deleteRecord, logActivity } from "../lib/airtable.js";

export const config = { runtime: "edge" };

// Airtable field name  <->  clean JSON key used by the frontend.
const FIELD = {
  name: "Business",
  role: "Role",
  currentRevenue: "Current Monthly Revenue",
  targetRevenue: "Target Monthly Revenue",
  priority90Day: "90-Day Priority",
  notes: "Notes",
  section: "Section",
  status: "Project Status",
  winning: "What Winning Looks Like",
  nextMove: "Next Move",
  blockers: "Blockers",
  ceoViewUrl: "CEO View URL",
  parentCompany: "Parent Company",
  priorityRank: "Priority Rank",
  sortOrder: "Sort Order"
};

function toJson(record) {
  const f = record.fields;
  const out = { id: record.id, createdTime: record.createdTime };
  for (const [key, airtableName] of Object.entries(FIELD)) out[key] = f[airtableName] ?? null;
  return out;
}

function toAirtableFields(body) {
  const fields = {};
  for (const [key, airtableName] of Object.entries(FIELD)) {
    if (body[key] !== undefined) fields[airtableName] = body[key];
  }
  return fields;
}

export default async function handler(request) {
  if (!(await requestIsAuthed(request, process.env.SESSION_SECRET))) {
    return new Response(JSON.stringify({ error: "Not signed in" }), { status: 401 });
  }

  if (request.method === "GET") {
    const records = await listRecords(TABLES.projects);
    return json(records.map(toJson));
  }

  if (request.method === "POST") {
    const body = await request.json();
    if (!body.name || !body.section) {
      return json({ error: "name and section are required" }, 400);
    }

    // New builds land at the end of their company + section group.
    if (body.sortOrder === undefined) {
      const all = await listRecords(TABLES.projects);
      const siblings = all.filter(
        (r) => r.fields[FIELD.section] === body.section && (r.fields[FIELD.parentCompany] || "").trim() === (body.parentCompany || "").trim()
      );
      body.sortOrder = siblings.length ? Math.max(...siblings.map((r) => r.fields[FIELD.sortOrder] ?? 0)) + 10 : 0;
    }

    const fields = toAirtableFields(body);
    const record = await createRecord(TABLES.projects, fields);
    await logActivity(
      body.section === "Present" ? `Added present build: ${body.name}` : `Added future build: ${body.name}`,
      "Added"
    );
    return json(toJson(record), 201);
  }

  if (request.method === "PATCH") {
    const body = await request.json();
    if (!body.id) return json({ error: "id is required" }, 400);

    // Look up the current record so we can tell what actually changed for the activity log.
    const before = await getRecord(TABLES.projects, body.id);
    const name = before?.fields?.[FIELD.name] || "Untitled";
    const wasSection = before?.fields?.[FIELD.section];

    // Only one build can hold a given Priority Rank -- bumping a new pick
    // into slot N clears whoever previously held slot N.
    if (body.priorityRank) {
      const all = await listRecords(TABLES.projects);
      const priorHolder = all.find((r) => r.id !== body.id && r.fields[FIELD.priorityRank] === body.priorityRank);
      if (priorHolder) await updateRecord(TABLES.projects, priorHolder.id, { [FIELD.priorityRank]: null });
    }

    const fields = toAirtableFields(body);
    const record = await updateRecord(TABLES.projects, body.id, fields);

    if (body.section && wasSection === "Future" && body.section === "Present") {
      await logActivity(`Promoted '${name}' from Future to Present`, "Promoted");
    } else if (body.section && wasSection === "Present" && body.section === "Future") {
      await logActivity(`Moved '${name}' back to Future Builds`, "Edited");
    } else {
      await logActivity(`Updated '${name}'`, "Edited");
    }

    return json(toJson(record));
  }

  if (request.method === "DELETE") {
    const body = await request.json();
    if (!body.id) return json({ error: "id is required" }, 400);
    const before = await getRecord(TABLES.projects, body.id);
    const name = before?.fields?.[FIELD.name] || "Untitled";

    if (body.reason === "completed") {
      // Completed builds move to their own section instead of vanishing --
      // the record (and its history) stays on the board.
      const record = await updateRecord(TABLES.projects, body.id, { [FIELD.section]: "Completed" });
      await logActivity(`Completed '${name}'`, "Completed");
      return json(toJson(record));
    }

    await deleteRecord(TABLES.projects, body.id);
    await logActivity(`Deleted '${name}'`, "Deleted");
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, 405);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
