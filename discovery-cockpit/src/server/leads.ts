/**
 * Lead Finder preview: a list the consultant imports from their own CSV. Nothing is scraped and no external
 * service is called. Every query is scoped to one consultant. The preview is off until it is switched on.
 */
import { prisma } from "../lib/db";
import { CsvError } from "../lib/csv";
import { mapLeads, type Skipped } from "../lib/leads";

export class LeadError extends Error {
  constructor(
    public code: "INVALID" | "CONFLICT" | "NOT_FOUND",
    message: string,
  ) {
    super(message);
  }
}

export const MAX_LEADS = 5_000;
const SKIP_DETAIL_LIMIT = 50;

export interface LeadSettings {
  enabled: boolean;
  niche: string;
  location: string;
  source: string;
}

export async function getLeadSettings(consultantId: string): Promise<LeadSettings> {
  const c = await prisma.consultant.findUniqueOrThrow({ where: { id: consultantId }, select: { leadFinderEnabled: true, leadNiche: true, leadLocation: true, leadSource: true } });
  return { enabled: c.leadFinderEnabled, niche: c.leadNiche ?? "", location: c.leadLocation ?? "", source: c.leadSource ?? "" };
}

export async function updateLeadSettings(consultantId: string, s: { enabled: boolean; niche: string | null; location: string | null; source: string | null }) {
  await prisma.consultant.update({ where: { id: consultantId }, data: { leadFinderEnabled: s.enabled, leadNiche: s.niche, leadLocation: s.location, leadSource: s.source } });
}

export async function listLeads(consultantId: string, limit = 200) {
  const [rows, total] = await Promise.all([
    prisma.lead.findMany({ where: { consultantId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit }),
    prisma.lead.count({ where: { consultantId } }),
  ]);
  return { total, leads: rows.map((l) => ({ id: l.id, name: l.name, company: l.company, email: l.email, phone: l.phone, website: l.website, niche: l.niche, location: l.location, source: l.source })) };
}

export interface ImportResult {
  imported: number;
  skipped: Skipped[];
  skippedCount: number;
  ignoredColumns: string[];
}

const nameKey = (name: string, company: string | null) => `${name.toLowerCase()}|${(company ?? "").toLowerCase()}`;

export async function importLeads(consultantId: string, csv: string): Promise<ImportResult> {
  if (!(await getLeadSettings(consultantId)).enabled) throw new LeadError("CONFLICT", "Switch the Lead Finder preview on before importing.");
  let mapped;
  try {
    mapped = mapLeads(csv);
  } catch (err) {
    if (err instanceof CsvError || err instanceof Error) throw new LeadError("INVALID", err.message);
    throw err;
  }
  if (mapped.leads.length === 0 && mapped.skipped.length === 0) throw new LeadError("INVALID", "That file has no rows to import.");

  const existing = await prisma.lead.findMany({ where: { consultantId }, select: { email: true, name: true, company: true } });
  const emails = new Set(existing.flatMap((l) => (l.email ? [l.email] : [])));
  const names = new Set(existing.map((l) => nameKey(l.name, l.company)));
  const seenInFile = new Map<string, number>();
  const skipped = [...mapped.skipped];
  const fresh: typeof mapped.leads = [];

  for (const lead of mapped.leads) {
    const key = lead.email ? `e:${lead.email}` : `n:${nameKey(lead.name, lead.company)}`;
    if (lead.email ? emails.has(lead.email) : names.has(nameKey(lead.name, lead.company))) {
      skipped.push({ row: lead.row, reason: lead.email ? "that email is already in your list" : "that name and company are already in your list" });
    } else if (seenInFile.has(key)) {
      skipped.push({ row: lead.row, reason: `a duplicate of row ${seenInFile.get(key)} in this file` });
    } else {
      seenInFile.set(key, lead.row);
      fresh.push(lead);
    }
  }

  if (existing.length + fresh.length > MAX_LEADS) {
    throw new LeadError("CONFLICT", `Your list can hold ${MAX_LEADS.toLocaleString("en-US")} leads. This import would take it to ${(existing.length + fresh.length).toLocaleString("en-US")}.`);
  }
  if (fresh.length) await prisma.lead.createMany({
      data: fresh.map((l) => ({ consultantId, name: l.name, company: l.company, email: l.email, phone: l.phone, website: l.website, niche: l.niche, location: l.location, source: l.source, notes: l.notes })),
    });
  skipped.sort((a, b) => a.row - b.row);
  return { imported: fresh.length, skipped: skipped.slice(0, SKIP_DETAIL_LIMIT), skippedCount: skipped.length, ignoredColumns: mapped.ignored };
}

export async function deleteLead(consultantId: string, id: string) {
  const r = await prisma.lead.deleteMany({ where: { id, consultantId } });
  if (r.count !== 1) throw new LeadError("NOT_FOUND", "That lead was not found.");
}

export async function clearLeads(consultantId: string): Promise<number> {
  return (await prisma.lead.deleteMany({ where: { consultantId } })).count;
}
