import { describe, expect, it } from "vitest";
import { ASSESSMENT_SEGMENTS } from "@/lib/demo/assessment-call";
import { DEMO_SEGMENTS } from "@/lib/demo/demo-call";
import { analyze } from "@/lib/mock-ai/engine";
import type { Segment } from "@/lib/mock-ai/types";
import { generatePrototype } from "@/lib/prototype/generate";
import { financeProvenance, MODULE_SCHEMAS, MODULE_TITLES, MODULE_TYPES, parseModule } from "@/lib/prototype/schema";

const number = (segs: { speaker: "CONSULTANT" | "CLIENT"; text: string }[]): Segment[] => segs.map((s, order) => ({ ...s, order }));
const assessment = analyze(number(ASSESSMENT_SEGMENTS), { type: "COMBINED_ASSESSMENT" });
const gen = (analysis = assessment, company = "Brightline Marketing", industry: string | null = "Marketing agency") => generatePrototype({ analysis, company, industry });
const mod = (list: ReturnType<typeof gen>, type: string) => list.find((m) => m.moduleType === type)!.data as any; // eslint-disable-line @typescript-eslint/no-explicit-any

describe("prototype generator", () => {
  const modules = gen();

  it("produces all four modules, in order, with their titles", () => {
    expect(modules.map((m) => [m.order, m.moduleType, m.title])).toEqual([
      [0, "nurture", "Client Nurture"],
      [1, "content", "Content Studio"],
      [2, "finance", "Financial Pulse"],
      [3, "security", "Security & Governance"],
    ]);
    expect(MODULE_TYPES.map((t) => MODULE_TITLES[t])).toEqual(modules.map((m) => m.title));
  });

  it("is deterministic: the same assessment always gives the same prototype", () => {
    expect(gen()).toEqual(gen());
  });

  it("every module validates against its strict schema", () => {
    for (const m of modules) expect(MODULE_SCHEMAS[m.moduleType].safeParse(m.data).success).toBe(true);
  });

  describe("Client Nurture", () => {
    const n = mod(modules, "nurture");
    it("has hot, warm and cold rows with days since contact and a suggested action each", () => {
      expect(new Set(n.contacts.map((c: { temperature: string }) => c.temperature))).toEqual(new Set(["hot", "warm", "cold"]));
      for (const c of n.contacts) {
        expect(c.daysSinceContact).toBeGreaterThanOrEqual(0);
        expect(c.nextAction.length).toBeGreaterThan(20);
      }
    });
    it("points actions at the client's own CRM and cites the problem they described", () => {
      expect(n.contacts[0].nextAction).toContain("HubSpot");
      expect(n.contacts[0].nextAction).toContain("leads go cold when replies are slow");
      expect(n.basis.join(" ")).toContain("Your CRM is HubSpot");
    });
    it("flags every invented row as an example", () => {
      expect(n.contacts.every((c: { example: boolean }) => c.example === true)).toBe(true);
    });
  });

  describe("Content Studio", () => {
    const c = mod(modules, "content");
    it("drafts for the channels the client actually publishes on, signed with their company", () => {
      expect(c.channels).toEqual(["LinkedIn", "Email newsletter"]);
      expect(new Set(c.drafts.map((d: { channel: string }) => d.channel))).toEqual(new Set(["LinkedIn", "Email newsletter"]));
      expect(c.drafts.every((d: { body: string }) => d.body.endsWith("— The Brightline Marketing team"))).toBe(true);
      expect(c.voice).toContain("marketing agency");
    });
    it("never turns the client's internal cost problem into something to publish", () => {
      expect(c.drafts.map((d: { topic: string }) => d.topic).join("|")).not.toMatch(/outside help/i);
    });
    it("makes no numeric claims it was not given", () => {
      expect(c.drafts.map((d: { body: string }) => d.body).join(" ")).not.toMatch(/\$|\d+%|\d+ hours/);
    });
  });

  describe("Financial Pulse", () => {
    const f = mod(modules, "finance");
    const line = (k: string) => f.lines.find((l: { key: string }) => l.key === k);
    it("uses the figures the client stated, and says so", () => {
      expect(f.lines.map((l: { key: string }) => l.key)).toEqual(["revenue", "receivables", "payroll", "overhead"]);
      expect(line("revenue")).toMatchObject({ actual: 95000, source: "stated" });
      expect(line("receivables")).toMatchObject({ actual: 38000, source: "stated" });
      expect(line("payroll")).toMatchObject({ actual: 41000, source: "stated" });
      expect(financeProvenance(f.lines)).toBe("All 4 actuals come from your call.");
      expect(f.summary).not.toMatch(/actuals/); // never stored: it would go stale when figures are entered
    });
    it("builds overhead from the real tool costs plus the contractor ($1,304 + $4,000)", () => {
      expect(line("overhead")).toMatchObject({ actual: 5304, source: "stated" });
    });
    it("gives every line a positive budget so percent used and remaining can be computed", () => {
      for (const l of f.lines) expect(l.budget).toBeGreaterThan(0);
      expect(f.note).toMatch(/placeholders/);
    });
  });

  describe("Security & Governance", () => {
    const s = mod(modules, "security");
    it("turns the client's own gaps into an alert feed, worst first, with times", () => {
      expect(s.feed.map((a: { severity: string }) => a.severity)).toEqual([...s.feed.map((a: { severity: string }) => a.severity)].sort((a, b) => "highmediumlow".indexOf(a) - "highmediumlow".indexOf(b)));
      const titles = s.feed.map((a: { title: string }) => a.title).join(" | ");
      expect(titles).toContain("Former contractor still has access (Asana)");
      expect(titles).toContain("Shared login used from 3 locations (HubSpot)");
      const minutes = s.feed.map((a: { minutesAgo: number }) => a.minutesAgo);
      expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
      expect(s.feed.every((a: { example: boolean }) => a.example === true)).toBe(true);
    });
    it("caps the feed and reports how many gaps it came from", () => {
      expect(s.feed.length).toBeLessThanOrEqual(7);
      expect(s.summary).toContain("9 gaps");
    });
  });

  describe("customisation, not a template", () => {
    it("a different client's assessment gives a different prototype", () => {
      const other = analyze([
        { speaker: "CLIENT", text: "We run a dental practice. Everyone shares one Dentrix login. Payroll is $20,000 a month and revenue is about $60,000 a month.", order: 0 },
        { speaker: "CLIENT", text: "We post on Instagram weekly. Salesforce is $300 a month.", order: 1 },
      ], { type: "COMBINED_ASSESSMENT" });
      const m = gen(other, "Harbour Dental", "Dental practice");
      expect(mod(m, "content").channels).toEqual(["Instagram"]);
      expect(mod(m, "content").drafts[0].body).toContain("Harbour Dental");
      expect(mod(m, "nurture").contacts[0].nextAction).toContain("Salesforce");
      expect(mod(m, "finance").lines.find((l: { key: string }) => l.key === "revenue").actual).toBe(60000);
      expect(mod(m, "security").feed[0].title).toContain("Shared login");
      expect(JSON.stringify(m)).not.toContain("Brightline");
      expect(JSON.stringify(m)).not.toContain("HubSpot");
    });

    it("an empty assessment still yields four valid modules, every row an example", () => {
      const m = gen(analyze([], { type: "COMBINED_ASSESSMENT" }), "Acme", null);
      expect(m).toHaveLength(4);
      expect(mod(m, "nurture").basis.join(" ")).toContain("No CRM was named");
      expect(mod(m, "content").channels).toEqual(["LinkedIn"]);
      expect(mod(m, "content").voice).toContain("No channels came up");
      expect(mod(m, "finance").lines.every((l: { source: string }) => l.source === "example")).toBe(true);
      expect(mod(m, "security").feed.every((a: { example: boolean }) => a.example)).toBe(true);
    });

    it("works from a discovery call too (the engine reads any call)", () => {
      const m = gen(analyze(number(DEMO_SEGMENTS)), "Brightline Marketing", "Marketing agency");
      expect(m).toHaveLength(4);
      expect(mod(m, "nurture").contacts[0].nextAction).toContain("HubSpot");
    });
  });
});

describe("module schemas are an allow-list", () => {
  const good = mod(gen(), "security");

  it("reject any field that is not declared, at the module and the row level", () => {
    expect(MODULE_SCHEMAS.security.safeParse({ ...good, coaching: { reason: "x" } }).success).toBe(false);
    expect(MODULE_SCHEMAS.security.safeParse({ ...good, quote: "I'm burned" }).success).toBe(false);
    expect(MODULE_SCHEMAS.security.safeParse({ ...good, feed: good.feed.map((a: object) => ({ ...a, decisionReadiness: 70 })) }).success).toBe(false);
    for (const [type, data] of Object.entries(Object.fromEntries(gen().map((m) => [m.moduleType, m.data])))) {
      expect(MODULE_SCHEMAS[type as keyof typeof MODULE_SCHEMAS].safeParse({ ...(data as object), internalNotes: "x" }).success, type).toBe(false);
    }
  });

  it("insist that invented rows say they are examples", () => {
    expect(MODULE_SCHEMAS.security.safeParse({ ...good, feed: good.feed.map((a: object) => ({ ...a, example: false })) }).success).toBe(false);
    const f = mod(gen(), "finance");
    expect(MODULE_SCHEMAS.finance.safeParse({ ...f, lines: [{ ...f.lines[0], source: "guess" }] }).success).toBe(false);
    expect(MODULE_SCHEMAS.finance.safeParse({ ...f, lines: [{ ...f.lines[0], budget: 0 }] }).success).toBe(false);
  });

  it("skip a module type nobody renders, but refuse a known type with bad data", () => {
    expect(parseModule("weather", { anything: 1 })).toBeNull(); // data-driven: unknown types are skipped
    expect(parseModule("security", good)?.type).toBe("security");
    expect(() => parseModule("security", { ...good, coaching: 1 })).toThrow();
    expect(() => parseModule("finance", { nonsense: true })).toThrow();
  });
});

describe("financeProvenance", () => {
  const L = (...sources: ("stated" | "entered" | "example")[]) => sources.map((source) => ({ source }));
  it.each([
    [L("stated", "stated", "stated", "stated"), "All 4 actuals come from your call."],
    [L("entered", "entered", "entered", "entered"), "All 4 actuals were entered for this review."],
    [L("example", "example", "example", "example"), "These are example figures, not yours."],
    [L("stated", "stated", "entered", "entered"), "2 of 4 actuals come from your call, 2 were entered."],
    [L("stated", "stated", "stated", "example"), "3 of 4 actuals come from your call, 1 is an example."],
    [L("stated", "entered", "example", "example"), "1 of 4 actuals come from your call, 1 was entered, 2 are examples."],
    [L("entered", "example", "example", "example"), "1 was entered, 3 are examples."],
  ])("%j", (lines, sentence) => {
    expect(financeProvenance(lines)).toBe(sentence);
  });
});
