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
import { embeddableBooking } from "./booking";
import { computeTimeEstimate } from "./roi";

const money = z.number().finite().nonnegative();

/** Only http(s) links may reach an href: a stored `javascript:` URL must fail the schema. */
const webUrl = z.string().max(300).refine((u) => {
  try {
    const p = new URL(u);
    return p.protocol === "https:" || p.protocol === "http:";
  } catch {
    return false;
  }
}, "not a web address");

const roiSchema = z
  .object({
    time: z
      .object({
        sinks: z.array(z.object({ title: z.string(), hoursPerWeek: z.number().finite().positive() }).strict()).min(1),
        hoursPerWeek: z.number().finite().positive(),
        hoursPerYear: z.number().finite().nonnegative(),
        recoverableHoursPerYear: z.number().finite().nonnegative(),
        /** A consultant-set assumption, never a figure the client stated. */
        hourlyValue: z.number().finite().positive().nullable(),
        recoverableValue: money.nullable(),
      })
      .strict()
      .nullable(),
    /** Annual figures the client put on a problem, each shown separately (they may overlap). */
    statedCosts: z.array(z.object({ title: z.string(), annualAmount: money, stated: z.string() }).strict()),
    assumptions: z.array(z.string()),
  })
  .strict();

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
    /** Conservative, labelled estimates; null when the client gave no figures to build on. */
    roi: roiSchema.nullable().default(null),
    nextSteps: z.array(z.string()).max(6).default([]),
    /** The consultant's (or the client-specific) booking page. */
    booking: z.object({ url: webUrl, label: z.string().min(1), embed: z.boolean().default(false) }).strict().nullable().default(null),
  })
  .strict()
  .superRefine((data, ctx) => {
    const expected = computeTotals(data.techStack);
    if (data.totals.monthly !== expected.monthly || data.totals.annual !== expected.annual) {
      ctx.addIssue({ code: "custom", path: ["totals"], message: "totals do not match the tech stack rows" });
    }
    if (data.booking?.embed && !embeddableBooking(data.booking.url)) {
      ctx.addIssue({ code: "custom", path: ["booking", "embed"], message: "only known scheduling providers may be embedded" });
    }
    if (data.roi) {
      const t = data.roi.time;
      if (!t && data.roi.statedCosts.length === 0) {
        ctx.addIssue({ code: "custom", path: ["roi"], message: "an estimate needs a figure to stand on" });
      }
      if (t) {
        const want = computeTimeEstimate(t.sinks, t.hourlyValue);
        const consistent =
          want !== null &&
          want.hoursPerWeek === t.hoursPerWeek &&
          want.hoursPerYear === t.hoursPerYear &&
          want.recoverableHoursPerYear === t.recoverableHoursPerYear &&
          want.recoverableValue === t.recoverableValue;
        if (!consistent) {
          ctx.addIssue({ code: "custom", path: ["roi", "time"], message: "time estimate does not follow from its rows" });
        }
      }
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
