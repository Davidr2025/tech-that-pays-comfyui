/**
 * Turning an imported CSV into leads: which column is which, and which rows are acceptable. Pure, so it
 * runs the same in tests. Nothing here fetches anything: the leads are only what the consultant imported.
 */
import { z } from "zod";
import { parseCsv } from "./csv";

export const LEAD_FIELDS = ["name", "company", "email", "phone", "website", "niche", "location", "source", "notes"] as const;
export type LeadField = (typeof LEAD_FIELDS)[number];

/** Header names we recognise (compared lower-case, ignoring spaces, dashes and underscores). */
const ALIASES: Record<LeadField, string[]> = {
  name: ["name", "fullname", "contact", "contactname", "person", "lead"],
  company: ["company", "companyname", "business", "businessname", "organization", "organisation", "account"],
  email: ["email", "emailaddress", "mail"],
  phone: ["phone", "phonenumber", "telephone", "tel", "mobile"],
  website: ["website", "url", "site", "web", "domain"],
  niche: ["niche", "industry", "sector", "category"],
  location: ["location", "city", "region", "area", "address"],
  source: ["source", "leadsource", "origin", "channel"],
  notes: ["notes", "note", "comments", "comment", "description"],
};

const norm = (h: string) => h.toLowerCase().replace(/[\s_-]+/g, "");

export function mapColumns(header: string[]): Partial<Record<LeadField, number>> {
  const map: Partial<Record<LeadField, number>> = {};
  header.forEach((h, i) => {
    const key = norm(h);
    for (const field of LEAD_FIELDS) if (map[field] === undefined && ALIASES[field].includes(key)) map[field] = i;
  });
  return map;
}

const clip = (max: number) => z.string().trim().max(max).transform((v) => v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ""));
const optional = (max: number) => clip(max).transform((v) => (v === "" ? null : v));

const website = z
  .string()
  .trim()
  .max(300)
  .transform((v, ctx) => {
    if (!v) return null;
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`;
    try {
      const u = new URL(withScheme);
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("scheme");
      return u.toString();
    } catch {
      ctx.addIssue({ code: "custom", message: "the website is not a web address" });
      return z.NEVER;
    }
  });

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(200)
  .transform((v, ctx) => {
    if (!v) return null;
    if (!z.string().email().safeParse(v).success) {
      ctx.addIssue({ code: "custom", message: "the email is not valid" });
      return z.NEVER;
    }
    return v;
  });

export const leadSchema = z.object({
  name: clip(120).refine((v) => v.length > 0, "there is no name"),
  company: optional(120),
  email,
  phone: optional(40),
  website,
  niche: optional(80),
  location: optional(120),
  source: optional(80),
  notes: optional(1000),
});
export type LeadInput = z.output<typeof leadSchema>;

export interface Skipped {
  /** The row as a spreadsheet counts it: the header is row 1, and a cell with line breaks is still one row. */
  row: number;
  reason: string;
}

export interface MappedLeads {
  leads: (LeadInput & { row: number })[];
  skipped: Skipped[];
  /** Columns we did not recognise, so the consultant knows what was ignored. */
  ignored: string[];
}

export function mapLeads(csv: string): MappedLeads {
  const rows = parseCsv(csv);
  if (rows.length === 0) return { leads: [], skipped: [], ignored: [] };
  const [header, ...body] = rows as [string[], ...string[][]];
  const cols = mapColumns(header);
  if (cols.name === undefined && cols.company === undefined && cols.email === undefined) {
    throw new Error("The first row must be a header with at least a Name, Company or Email column.");
  }
  const used = new Set(Object.values(cols));
  const ignored = header.map((h, i) => (used.has(i) || !h.trim() ? null : h.trim())).filter((h): h is string => h !== null);

  const leads: MappedLeads["leads"] = [];
  const skipped: Skipped[] = [];
  body.forEach((cells, i) => {
    const row = i + 2;
    const pick = (f: LeadField) => (cols[f] === undefined ? "" : (cells[cols[f]!] ?? ""));
    // A row with only a company or an email still names a lead.
    const raw = { name: pick("name") || pick("company") || pick("email"), company: pick("company"), email: pick("email"), phone: pick("phone"), website: pick("website"), niche: pick("niche"), location: pick("location"), source: pick("source"), notes: pick("notes") };
    if (Object.values(raw).every((v) => v.trim() === "")) return; // a blank-looking line
    const parsed = leadSchema.safeParse(raw);
    if (parsed.success) leads.push({ ...parsed.data, row });
    else skipped.push({ row, reason: parsed.error.issues[0]?.message ?? "the row is not valid" });
  });
  return { leads, skipped, ignored };
}
