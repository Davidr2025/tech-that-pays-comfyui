/**
 * The prototype dashboard's data: an ALLOW-LIST, like the reveal's.
 *
 * Each module type has a strict schema (unknown keys are errors), applied when modules are
 * written AND when they are read. Nothing private (quotes, coaching, readiness, objections) has
 * a field to live in. Every row the generator invents carries `example: true` so the page can
 * label it; finance actuals say whether they were `stated` on the call or are an `example`.
 *
 * The module list is data-driven: a row whose `moduleType` is not registered here is skipped
 * when reading, so modules can be added or removed without touching stored sessions.
 */
import { z } from "zod";

const example = z.literal(true);
const money = z.number().finite().nonnegative();

/** Limits for what a consultant can type into a prototype (also enforced when the edit is applied). */
export const PROTOTYPE_LIMITS = { contacts: 50, alerts: 50, draftBody: 2000, label: 120, short: 60, detail: 300, amount: 1_000_000_000 } as const;

export const nurtureSchema = z
  .object({
    summary: z.string(),
    basis: z.array(z.string()),
    contacts: z
      .array(
        z
          .object({
            id: z.string(),
            label: z.string(),
            stage: z.string(),
            temperature: z.enum(["hot", "warm", "cold"]),
            daysSinceContact: z.number().int().nonnegative(),
            nextAction: z.string(),
            /** True for rows the generator invented; false for a contact the consultant typed in. */
            example: z.boolean(),
          })
          .strict(),
      )
      .max(PROTOTYPE_LIMITS.contacts),
  })
  .strict();

export const DRAFT_STATUSES = ["pending", "approved", "rejected"] as const;

export const contentSchema = z
  .object({
    summary: z.string(),
    channels: z.array(z.string()).min(1),
    voice: z.string(),
    drafts: z
      .array(
        z
          .object({
            id: z.string(),
            channel: z.string(),
            topic: z.string(),
            body: z.string().max(PROTOTYPE_LIMITS.draftBody),
            example,
            /** A person approves or rejects each draft; nothing is published by default. */
            status: z.enum(DRAFT_STATUSES).default("pending"),
            /** True once a person has rewritten the generated text. */
            edited: z.boolean().default(false),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export const FINANCE_KEYS = ["revenue", "receivables", "payroll", "overhead"] as const;

export const financeSchema = z
  .object({
    period: z.string(),
    summary: z.string(),
    note: z.string(),
    lines: z
      .array(
        z
          .object({
            key: z.enum(FINANCE_KEYS),
            label: z.string(),
            actual: money,
            budget: money.refine((b) => b > 0, "a budget must be above zero"),
            /** Where `actual` came from: said on the call, typed in by the consultant, or an illustrative figure. */
            source: z.enum(["stated", "entered", "example"]),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export const securitySchema = z
  .object({
    summary: z.string(),
    feed: z
      .array(
        z
          .object({
            id: z.string(),
            severity: z.enum(["low", "medium", "high"]),
            title: z.string(),
            detail: z.string(),
            minutesAgo: z.number().int().nonnegative(),
            tool: z.string().nullable(),
            example,
          })
          .strict(),
      )
      .max(PROTOTYPE_LIMITS.alerts),
  })
  .strict();

export const MODULE_SCHEMAS = {
  nurture: nurtureSchema,
  content: contentSchema,
  finance: financeSchema,
  security: securitySchema,
} as const;

export type ModuleType = keyof typeof MODULE_SCHEMAS;
export const MODULE_TYPES = Object.keys(MODULE_SCHEMAS) as ModuleType[];

export const MODULE_TITLES: Record<ModuleType, string> = {
  nurture: "Client Nurture",
  content: "Content Studio",
  finance: "Financial Pulse",
  security: "Security & Governance",
};

export type NurtureData = z.infer<typeof nurtureSchema>;
export type ContentData = z.infer<typeof contentSchema>;
export type FinanceData = z.infer<typeof financeSchema>;
export type SecurityData = z.infer<typeof securitySchema>;

export type ModuleData =
  | { type: "nurture"; data: NurtureData }
  | { type: "content"; data: ContentData }
  | { type: "finance"; data: FinanceData }
  | { type: "security"; data: SecurityData };

export interface PrototypeModuleView {
  id: string;
  title: string;
  module: ModuleData;
}

/** Validates one stored module. Unknown types return null (skipped); invalid known types throw. */
export function parseModule(moduleType: string, data: unknown): ModuleData | null {
  if (!(moduleType in MODULE_SCHEMAS)) return null;
  const type = moduleType as ModuleType;
  return { type, data: MODULE_SCHEMAS[type].parse(data) } as ModuleData;
}

/**
 * One honest sentence about where the finance actuals came from, worked out from the lines as they
 * are NOW. It is computed (never stored), so an edit cannot leave it saying something false.
 */
export function financeProvenance(lines: { source: "stated" | "entered" | "example" }[]): string {
  const n = lines.length;
  const count = (s: "stated" | "entered" | "example") => lines.filter((l) => l.source === s).length;
  const stated = count("stated");
  const entered = count("entered");
  const examples = count("example");
  if (stated === n) return `All ${n} actuals come from your call.`;
  if (entered === n) return `All ${n} actuals were entered for this review.`;
  if (examples === n) return `These are example figures, not yours.`;
  const parts = [
    stated ? `${stated} of ${n} actuals come from your call` : null,
    entered ? `${entered} ${entered === 1 ? "was" : "were"} entered` : null,
    examples ? `${examples} ${examples === 1 ? "is an example" : "are examples"}` : null,
  ].filter((p): p is string => p !== null);
  return `${parts.join(", ")}.`;
}

export const PROTOTYPE_LABEL = "PROTOTYPE";
