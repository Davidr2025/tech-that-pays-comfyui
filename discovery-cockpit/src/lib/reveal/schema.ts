/**
 * The client-facing "reveal" payload — an explicit ALLOW-LIST.
 *
 * Every object is `.strict()`: a key that is not declared here makes parsing fail instead
 * of silently passing through. The schema is applied when the report is written AND again
 * when the reveal page reads it, so a private field cannot reach a client either way.
 *
 * Deliberately absent (private, consultant-only): coaching, internalNotes,
 * decisionReadiness, severity, buying signals, objections, suggested questions, quotes.
 */
import { z } from "zod";
import { isValidLogoUrl } from "../logo";
import { SESSION_TYPES } from "../session-types";

const money = z.number().finite().nonnegative();

export const REVEAL_PERIODS = ["month", "year", "week", "day", "hour", "unspecified"] as const;

export const revealSchema = z
  .object({
    version: z.literal(1),
    /** Which kind of session this review is for: sets the document's title. */
    kind: z.enum(SESSION_TYPES),
    generatedAt: z.string().datetime(),
    header: z
      .object({
        consultantName: z.string().min(1),
        businessName: z.string().min(1),
        tagline: z.string().nullable(),
        brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        /** A validated data: URL (see src/lib/logo.ts), or null. Rendered only inside <img>. */
        logoUrl: z.string().refine(isValidLogoUrl, "not a valid logo image").nullable(),
        clientName: z.string().min(1),
        clientCompany: z.string().min(1),
      })
      .strict(),
    summary: z.string(),
    /** Date phrases the client gave themselves, e.g. "mid-November" — never the surrounding sentence. */
    timeline: z.object({ deadline: z.string().nullable(), window: z.string().nullable() }).strict(),
    painPoints: z.array(z.object({ title: z.string(), detail: z.string() }).strict()),
    currentState: z.array(z.string()),
    futureState: z.array(z.string()),
    moneyMentioned: z.array(
      z.object({ amount: money, period: z.enum(REVEAL_PERIODS), context: z.string() }).strict(),
    ),
    techStack: z.array(
      z
        .object({
          tool: z.string(),
          purpose: z.string(),
          monthlyCost: money.nullable(),
          annualCost: money.nullable(),
          note: z.string().nullable(),
        })
        .strict(),
    ),
    totals: z
      .object({
        monthly: money,
        annual: money,
        toolsWithCost: z.number().int().nonnegative(),
        toolsTotal: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const expected = computeTotals(data.techStack);
    if (data.totals.monthly !== expected.monthly || data.totals.annual !== expected.annual) {
      ctx.addIssue({ code: "custom", path: ["totals"], message: "totals do not match the tech stack rows" });
    }
    if (data.totals.toolsWithCost !== expected.toolsWithCost || data.totals.toolsTotal !== expected.toolsTotal) {
      ctx.addIssue({ code: "custom", path: ["totals"], message: "tool counts do not match the tech stack rows" });
    }
  });

export type RevealData = z.infer<typeof revealSchema>;
export type RevealTechRow = RevealData["techStack"][number];

const cents = (n: number) => Math.round(n * 100);

/** Monthly and annual totals over the rows that have a stated cost. Summed in integer cents. */
export function computeTotals(rows: Pick<RevealTechRow, "monthlyCost" | "annualCost">[]): RevealData["totals"] {
  let monthly = 0;
  let annual = 0;
  let withCost = 0;
  for (const r of rows) {
    if (r.monthlyCost !== null) {
      monthly += cents(r.monthlyCost);
      withCost += 1;
    }
    if (r.annualCost !== null) annual += cents(r.annualCost);
  }
  return { monthly: monthly / 100, annual: annual / 100, toolsWithCost: withCost, toolsTotal: rows.length };
}
