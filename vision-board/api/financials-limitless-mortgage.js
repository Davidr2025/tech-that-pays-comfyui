import { requestIsAuthed } from "../lib/auth.js";
import { TABLES, listRecords } from "../lib/airtable.js";

export const config = { runtime: "edge" };

const BUSINESS_NAME = "Limitless Mortgage";

export default async function handler(request) {
  if (!(await requestIsAuthed(request, process.env.SESSION_SECRET))) {
    return new Response(JSON.stringify({ error: "Not signed in" }), { status: 401 });
  }

  const businesses = await listRecords(TABLES.projects);
  const business = businesses.find((r) => r.fields["Business"] === BUSINESS_NAME);
  if (!business) {
    return new Response(JSON.stringify({ error: `${BUSINESS_NAME} record not found` }), { status: 404 });
  }
  const f = business.fields;
  const linkedIds = new Set((f["Commitments"] || []).map((r) => r.id));

  const allCommitments = await listRecords(TABLES.commitments);
  const commitments = allCommitments
    .filter((r) => linkedIds.has(r.id))
    .map((r) => ({
      commitment: r.fields["Commitment"],
      status: r.fields["Status"]?.name || null,
      owner: r.fields["Owner"]?.name || null,
      dueDate: r.fields["Due Date"] || null,
      notes: r.fields["Notes"] || null,
      outcome: r.fields["Outcome"] || null
    }))
    .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));

  return new Response(
    JSON.stringify({
      name: BUSINESS_NAME,
      role: f["Role"]?.name || null,
      health: f["Health"]?.name || null,
      currentRevenue: f["Current Monthly Revenue"] ?? null,
      targetRevenue: f["Target Monthly Revenue"] ?? null,
      winning: f["What Winning Looks Like"] || null,
      nextMove: f["Next Move"] || null,
      blockers: f["Blockers"] || null,
      notes: f["Notes"] || null,
      commitments
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
