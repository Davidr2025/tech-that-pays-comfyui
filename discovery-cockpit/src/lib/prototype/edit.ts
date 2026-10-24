/**
 * What a consultant can change on a prototype, as data: a closed set of operations, each strict.
 * `applyEdit` is pure; the caller re-validates the result against the module's strict schema
 * before storing it, so an operation can never smuggle in a field the schema does not declare.
 */
import { z } from "zod";
import {
  DRAFT_STATUSES,
  FINANCE_KEYS,
  PROTOTYPE_LIMITS as L,
  type ContentData,
  type FinanceData,
  type ModuleType,
  type NurtureData,
  type SecurityData,
} from "./schema";

const text = (max: number, min = 1) => z.string().trim().min(min, "This cannot be empty.").max(max, `Keep this under ${max} characters.`);
const moduleId = z.string().min(1).max(60);

export const editSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("draft"), moduleId, draftId: z.string().min(1).max(60), status: z.enum(DRAFT_STATUSES).optional(), body: text(L.draftBody).optional() }).strict(),
  z
    .object({
      op: z.literal("finance"),
      moduleId,
      lines: z
        .array(
          z
            .object({
              key: z.enum(FINANCE_KEYS),
              actual: z.number("Enter a number.").finite("Enter a number.").min(0, "An amount cannot be negative.").max(L.amount, "That amount is too large."),
              budget: z.number("Enter a number.").finite("Enter a number.").gt(0, "A budget must be above zero.").max(L.amount, "That amount is too large."),
            })
            .strict(),
        )
        .min(1)
        .max(FINANCE_KEYS.length),
    })
    .strict(),
  z
    .object({
      op: z.literal("alert.add"),
      moduleId,
      severity: z.enum(["low", "medium", "high"]),
      title: text(L.label),
      detail: text(L.detail, 0).default(""),
      tool: text(L.short, 0).nullish(),
    })
    .strict(),
  z.object({ op: z.literal("alert.remove"), moduleId, alertId: z.string().min(1).max(60) }).strict(),
  z
    .object({
      op: z.literal("contact.add"),
      moduleId,
      label: text(L.label),
      stage: text(L.short, 0).default(""),
      temperature: z.enum(["hot", "warm", "cold"]),
      daysSinceContact: z.number().int().min(0).max(3650),
      nextAction: text(L.detail),
    })
    .strict(),
  z.object({ op: z.literal("contact.remove"), moduleId, contactId: z.string().min(1).max(60) }).strict(),
]);

export type PrototypeEdit = z.output<typeof editSchema>;

/** Which module type each operation applies to. */
export const OP_MODULE: Record<PrototypeEdit["op"], ModuleType> = {
  draft: "content",
  finance: "finance",
  "alert.add": "security",
  "alert.remove": "security",
  "contact.add": "nurture",
  "contact.remove": "nurture",
};

export class EditRejected extends Error {}

/** Applies one edit to a module's data. `newId` makes ids for added rows. Throws EditRejected for a bad target or a limit. */
export function applyEdit(type: "content", data: ContentData, edit: PrototypeEdit, newId: () => string): ContentData;
export function applyEdit(type: "finance", data: FinanceData, edit: PrototypeEdit, newId: () => string): FinanceData;
export function applyEdit(type: "security", data: SecurityData, edit: PrototypeEdit, newId: () => string): SecurityData;
export function applyEdit(type: "nurture", data: NurtureData, edit: PrototypeEdit, newId: () => string): NurtureData;
export function applyEdit(type: ModuleType, data: ContentData | FinanceData | SecurityData | NurtureData, edit: PrototypeEdit, newId: () => string) {
  if (OP_MODULE[edit.op] !== type) throw new EditRejected("That change does not apply to this part of the prototype.");

  switch (edit.op) {
    case "draft": {
      const d = data as ContentData;
      const target = d.drafts.find((x) => x.id === edit.draftId);
      if (!target) throw new EditRejected("That draft no longer exists.");
      if (edit.status === undefined && edit.body === undefined) throw new EditRejected("Nothing to change.");
      return {
        ...d,
        drafts: d.drafts.map((x) =>
          x.id !== edit.draftId ? x : { ...x, ...(edit.status ? { status: edit.status } : {}), ...(edit.body !== undefined ? { body: edit.body, edited: edit.body !== x.body || x.edited } : {}) },
        ),
      };
    }
    case "finance": {
      const d = data as FinanceData;
      const given = new Map(edit.lines.map((l) => [l.key, l]));
      if (given.size !== edit.lines.length) throw new EditRejected("Each line can only be entered once.");
      for (const key of given.keys()) if (!d.lines.some((l) => l.key === key)) throw new EditRejected(`There is no ${key} line to change.`);
      // `source` says where the ACTUAL came from. It becomes "entered" only when the actual changes, so
      // a form that resubmits every line cannot relabel figures that were stated on the call, and
      // setting a real budget does not turn a stated actual into an entered one.
      return {
        ...d,
        lines: d.lines.map((l) => {
          const g = given.get(l.key);
          if (!g) return l;
          return { ...l, actual: g.actual, budget: g.budget, source: g.actual === l.actual ? l.source : ("entered" as const) };
        }),
      };
    }
    case "alert.add": {
      const d = data as SecurityData;
      if (d.feed.length >= L.alerts) throw new EditRejected(`A prototype holds at most ${L.alerts} alerts.`);
      // Typed in for the demonstration, so it stays flagged as an example like every other alert.
      return { ...d, feed: [{ id: newId(), severity: edit.severity, title: edit.title, detail: edit.detail, minutesAgo: 0, tool: edit.tool || null, example: true as const }, ...d.feed] };
    }
    case "alert.remove": {
      const d = data as SecurityData;
      if (!d.feed.some((a) => a.id === edit.alertId)) throw new EditRejected("That alert no longer exists.");
      return { ...d, feed: d.feed.filter((a) => a.id !== edit.alertId) };
    }
    case "contact.add": {
      const d = data as NurtureData;
      if (d.contacts.length >= L.contacts) throw new EditRejected(`A prototype holds at most ${L.contacts} contacts.`);
      return {
        ...d,
        // A contact the consultant typed from the client's own records is real, not an invented example.
        contacts: [{ id: newId(), label: edit.label, stage: edit.stage, temperature: edit.temperature, daysSinceContact: edit.daysSinceContact, nextAction: edit.nextAction, example: false }, ...d.contacts],
      };
    }
    case "contact.remove": {
      const d = data as NurtureData;
      if (!d.contacts.some((c) => c.id === edit.contactId)) throw new EditRejected("That contact no longer exists.");
      return { ...d, contacts: d.contacts.filter((c) => c.id !== edit.contactId) };
    }
  }
}
