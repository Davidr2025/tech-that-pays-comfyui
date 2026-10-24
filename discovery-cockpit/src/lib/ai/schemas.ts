/**
 * Shapes for everything the Claude provider reads or writes.
 *
 *   deltaSchema       what the model returns for a live-analysis call (quotes and judgments, never arithmetic)
 *   stateSchema       the findings the app accumulates from those answers (stored; validated again on read)
 *   narrativeSchema   the reveal wording the model may rewrite (every number stays the app's)
 *   prototypeOutSchema  the example content the model may write for three prototype modules
 *
 * Model-facing schemas carry limits too; the structured-output converter may drop some of them, so the app
 * validates the answer with these exact schemas rather than trusting the API to have enforced them.
 */
import { z } from "zod";
import { PAIN_CATEGORIES } from "../mock-ai/pain";

export const PAIN_IDS = PAIN_CATEGORIES.map((c) => c.id) as [string, ...string[]];

const SEVERITY = z.enum(["low", "medium", "high"]);
const text = (max: number) => z.string().trim().min(1).max(max);
const quote = text(400);

// ---------- live analysis: the model's answer ----------

const cueIn = z.object({ kind: text(40), quote }).strict();

export const deltaSchema = z
  .object({
    painPoints: z
      .array(
        z
          .object({
            category: z.enum(PAIN_IDS),
            /** One complete client sentence, copied exactly, that expresses the problem. */
            quote,
            /** One complete client sentence stating an hours or dollar figure for THIS problem, or null. */
            figureQuote: quote.nullable(),
            severity: SEVERITY,
          })
          .strict(),
      )
      .max(12),
    signals: z.array(cueIn).max(8),
    objections: z.array(cueIn).max(8),
    techStack: z
      .array(
        z
          .object({
            tool: text(40),
            purpose: text(60),
            /** One complete client sentence stating what this tool costs, or null. */
            costQuote: quote.nullable(),
          })
          .strict(),
      )
      .max(20),
    facts: z
      .object({
        budgetQuote: quote.nullable(),
        urgencyQuote: quote.nullable(),
        decisionQuote: quote.nullable(),
        decisionRole: z.enum(["maker", "shared"]).nullable(),
      })
      .strict(),
    questionsCovered: z.array(text(60)).max(40),
    decisionReadiness: z.object({ score: z.number().int().min(0).max(100), reason: text(240) }).strict(),
    reflectBackSummary: text(700),
    suggestedNextQuestion: z.object({ text: text(240), why: text(160) }).strict(),
  })
  .strict();
export type Delta = z.infer<typeof deltaSchema>;

// ---------- accumulated findings (stored) ----------

const cue = z.object({ kind: z.string().max(40), quote: z.string().max(400), segmentOrder: z.number().int().nonnegative() }).strict();

export const stateSchema = z
  .object({
    v: z.literal(1),
    pains: z
      .array(
        z
          .object({
            id: z.enum(PAIN_IDS),
            quote: z.string().max(400),
            order: z.number().int().nonnegative(),
            severity: SEVERITY,
            mentions: z.number().int().positive(),
            figureQuote: z.string().max(400).nullable(),
          })
          .strict(),
      )
      .max(PAIN_IDS.length),
    tech: z
      .array(
        z
          .object({
            tool: z.string().max(40),
            purpose: z.string().max(60),
            monthlyCost: z.number().finite().nonnegative().nullable(),
            annualCost: z.number().finite().nonnegative().nullable(),
            note: z.string().max(40).nullable(),
            order: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(25),
    signals: z.array(cue).max(30),
    objections: z.array(cue).max(30),
    facts: z
      .object({
        budget: cue.nullable(),
        urgency: cue.nullable(),
        decision: cue.extend({ role: z.enum(["maker", "shared"]) }).strict().nullable(),
      })
      .strict(),
    covered: z.array(z.string().max(60)).max(60),
    readiness: z.object({ score: z.number().int().min(0).max(100), reason: z.string().max(240) }).strict().nullable(),
    reflectBack: z.string().max(700),
    followUp: z.object({ text: z.string().max(240), why: z.string().max(160) }).strict().nullable(),
  })
  .strict();
export type AnalysisState = z.infer<typeof stateSchema>;

export const emptyState = (): AnalysisState => ({
  v: 1,
  pains: [],
  tech: [],
  signals: [],
  objections: [],
  facts: { budget: null, urgency: null, decision: null },
  covered: [],
  readiness: null,
  reflectBack: "",
  followUp: null,
});

// ---------- reveal wording ----------

export const narrativeSchema = z
  .object({
    summary: text(1200),
    /** One entry per pain point, in the order given. Only `detail` is used; the title stays the app's. */
    painPoints: z.array(z.object({ detail: text(400) }).strict()).max(12),
    currentState: z.array(text(240)).max(8),
    futureState: z.array(text(240)).max(8),
    /** At most three; the app appends the booking step itself. */
    nextSteps: z.array(text(200)).max(3),
  })
  .strict();
export type Narrative = z.infer<typeof narrativeSchema>;

// ---------- prototype example content ----------

export const prototypeOutSchema = z
  .object({
    nurture: z
      .object({
        summary: text(400),
        basis: z.array(text(240)).max(5),
        contacts: z
          .array(
            z
              .object({
                label: text(80),
                stage: text(60),
                temperature: z.enum(["hot", "warm", "cold"]),
                daysSinceContact: z.number().int().min(0).max(365),
                nextAction: text(300),
              })
              .strict(),
          )
          .min(3)
          .max(6),
      })
      .strict(),
    content: z
      .object({
        summary: text(400),
        channels: z.array(text(40)).min(1).max(5),
        voice: text(240),
        drafts: z
          .array(z.object({ channel: text(40), topic: text(120), body: text(1200) }).strict())
          .min(2)
          .max(5),
      })
      .strict(),
    security: z
      .object({
        summary: text(400),
        feed: z
          .array(
            z
              .object({
                severity: SEVERITY,
                title: text(100),
                detail: text(300),
                /** A tool the client named, or null. */
                tool: text(40).nullable(),
              })
              .strict(),
          )
          .min(3)
          .max(6),
      })
      .strict(),
  })
  .strict();
export type PrototypeOut = z.infer<typeof prototypeOutSchema>;
