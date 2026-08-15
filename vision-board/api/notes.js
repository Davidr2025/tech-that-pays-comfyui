import { requestIsAuthed } from "../lib/auth.js";
import { TABLES, listRecords, getRecord, createRecord, updateRecord, deleteRecord, logActivity } from "../lib/airtable.js";

export const config = { runtime: "edge" };

function toJson(record) {
  return {
    id: record.id,
    createdTime: record.createdTime,
    note: record.fields.Note ?? "",
    pinned: !!record.fields.Pinned
  };
}

export default async function handler(request) {
  if (!(await requestIsAuthed(request, process.env.SESSION_SECRET))) {
    return new Response(JSON.stringify({ error: "Not signed in" }), { status: 401 });
  }

  if (request.method === "GET") {
    const records = await listRecords(TABLES.notes);
    // Newest first, but pinned notes always float to the top.
    const all = records.map(toJson).sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));
    all.sort((a, b) => Number(b.pinned) - Number(a.pinned));
    return json(all);
  }

  if (request.method === "POST") {
    const { note, pinned } = await request.json();
    if (!note || !note.trim()) return json({ error: "note text is required" }, 400);
    const record = await createRecord(TABLES.notes, { Note: note.trim(), Pinned: !!pinned });
    await logActivity(`Scratchpad note added: "${note.trim().slice(0, 60)}${note.trim().length > 60 ? "…" : ""}"`, "Note");
    return json(toJson(record), 201);
  }

  if (request.method === "PATCH") {
    const { id, note, pinned } = await request.json();
    if (!id) return json({ error: "id is required" }, 400);
    const fields = {};
    if (note !== undefined) fields.Note = note;
    if (pinned !== undefined) fields.Pinned = pinned;
    const record = await updateRecord(TABLES.notes, id, fields);
    return json(toJson(record));
  }

  if (request.method === "DELETE") {
    const { id } = await request.json();
    if (!id) return json({ error: "id is required" }, 400);
    const before = await getRecord(TABLES.notes, id);
    await deleteRecord(TABLES.notes, id);
    await logActivity(`Scratchpad note deleted: "${(before?.fields?.Note || "").slice(0, 60)}"`, "Deleted");
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, 405);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
