import { describe, expect, it } from "vitest";
import { DEMO_SEGMENTS } from "@/lib/demo/demo-call";
import { analyze, countWords, findMoney, pickNextQuestion, splitSentences, talkRatio } from "@/lib/mock-ai/engine";
import { QUESTION_BANK } from "@/lib/mock-ai/questions";
import type { Segment } from "@/lib/mock-ai/types";
import { computeTotals } from "@/lib/reveal/schema";
import { CEDAR_SEGMENTS } from "./fixtures/cedar-ridge";

const number = (segs: { speaker: "CONSULTANT" | "CLIENT"; text: string }[]): Segment[] => segs.map((s, order) => ({ ...s, order }));
const demo = number(DEMO_SEGMENTS);
const cedar = number(CEDAR_SEGMENTS);
const client = (text: string, order = 0): Segment => ({ speaker: "CLIENT", text, order });
const consultant = (text: string, order = 0): Segment => ({ speaker: "CONSULTANT", text, order });

/** Ground truth: "Expected coaching outputs" in the Demo Seed Pack. */
describe("Demo Seed Pack — Brightline Marketing", () => {
  const a = analyze(demo);

  it("is the transcript the pack describes", () => {
    const words = (who: "CLIENT" | "CONSULTANT") => demo.filter((s) => s.speaker === who).reduce((n, s) => n + countWords(s.text), 0);
    expect(demo).toHaveLength(20);
    expect(words("CLIENT") + words("CONSULTANT")).toBe(772);
    expect(words("CLIENT")).toBe(568);
    expect(words("CONSULTANT")).toBe(204);
    expect(countWords(demo[0]!.text)).toBe(54); // the opener: the consultant's longest turn
  });

  it("finds the 6 pain points, 3 high and 3 medium", () => {
    expect(a.painPoints.map((p) => [p.id, p.severity])).toEqual([
      ["manual_reporting", "high"],
      ["outsourcing_cost", "high"],
      ["lead_followup", "high"],
      ["capacity", "medium"],
      ["slow_sales_cycle", "medium"],
      ["tool_overlap", "medium"],
    ]);
  });

  it("quantifies each pain from what the client actually said", () => {
    const impact = Object.fromEntries(a.painPoints.map((p) => [p.id, p.impact]));
    expect(impact).toMatchObject({
      manual_reporting: "about 10–12 hours per week", // "ten to twelve hours a week", spoken as words
      outsourcing_cost: "about $48,000 per year",
      lead_followup: "about 3–4 leads per month", // a count, deliberately not a dollar figure
      slow_sales_cycle: "about $150,000 per year",
    });
  });

  it("extracts 9 dollar mentions and never treats the lead count as money", () => {
    expect(a.money.map((m) => [m.amount, m.period])).toEqual([
      [800, "month"],
      [120, "month"],
      [99, "month"],
      [20, "month"],
      [135, "month"],
      [4000, "month"],
      [4000, "month"], // said twice: once as the contractor cost, once as the "kills me" line
      [48000, "year"],
      [150000, "year"],
    ]);
  });

  it("builds the tech-stack table: $1,174/mo and $14,088/yr over the 5 costed tools", () => {
    const costed = a.tech.filter((t) => t.monthlyCost !== null);
    expect(costed.map((t) => [t.tool, t.monthlyCost])).toEqual([
      ["HubSpot", 800],
      ["Asana", 120],
      ["Zapier", 99],
      ["Calendly", 20],
      ["Google Workspace", 135],
    ]);
    expect(computeTotals(a.tech)).toEqual({ monthly: 1174, annual: 14088, toolsWithCost: 5, toolsTotal: 6 });
    // "Google Sheet template" is a real mention with no stated cost; Upwork is a contractor, not a tool.
    expect(a.tech.find((t) => t.tool === "Google Sheets")?.monthlyCost).toBeNull();
    expect(a.tech.map((t) => t.tool)).not.toContain("Upwork");
  });

  it("pairs each price with its own tool when two share a sentence (Asana vs Zapier)", () => {
    expect(a.tech.find((t) => t.tool === "Asana")?.monthlyCost).toBe(120);
    expect(a.tech.find((t) => t.tool === "Zapier")?.monthlyCost).toBe(99);
  });

  it("finds exactly the 2 buying signals and the 1 objection", () => {
    expect(a.signals.map((s) => [s.kind, s.quote.includes("sign up tomorrow") || s.quote.includes("How fast could we start")])).toEqual([
      ["Ready to commit", true],
      ["Asks about starting", true],
    ]);
    expect(a.objections).toHaveLength(1);
    expect(a.objections[0]?.quote).toMatch(/freelancer.*broke during a launch/);
  });

  it("reads urgency and decision-maker as decision factors, not buying signals", () => {
    expect(a.facts.decision?.role).toBe("maker");
    expect(a.facts.urgency?.quote).toMatch(/mid-November/);
    expect(a.facts.budget).toBeNull(); // nobody states a budget in this call
    expect(a.timeline).toEqual({ deadline: "mid-November", window: "the next two to three weeks" });
  });

  it("scores decision readiness 70–75 and explains why", () => {
    expect(a.readiness.score).toBeGreaterThanOrEqual(70);
    expect(a.readiness.score).toBeLessThanOrEqual(75);
    expect(a.readiness.tier).toBe("ready");
    expect(a.readiness.reason).toMatch(/decision-maker, urgency and 2 buying signals confirmed/i);
    expect(a.readiness.reason).toMatch(/still need an explicit budget/);
    expect(a.readiness.reason).toMatch(/1 open objection/);
  });

  it("measures the talk ratio at 74% client / 26% consultant", () => {
    expect(a.talk).toMatchObject({ consultantPct: 26, clientPct: 74, consultantWords: 204, clientWords: 568 });
  });

  it("suggests pricing a recovered lead next, with the bank question queued behind it", () => {
    expect(a.nextQuestion.text).toBe("What is one recovered lead worth to you in revenue?");
    expect(a.nextQuestion.why).toMatch(/dollar value/);
    expect(a.nextQuestion.after).toBe("What breaks first when volume spikes?");
  });

  it("reflects back the top pains, their numbers and the deadline", () => {
    expect(a.reflectBack).toContain("manual, time-consuming reporting (about 10–12 hours per week)");
    expect(a.reflectBack).toContain("high spend on outsourced overflow work (about $48,000 per year)");
    expect(a.reflectBack).toContain("target date of mid-November");
  });

  it("marks only the questions the call actually reached as covered", () => {
    const uncovered = QUESTION_BANK.map((q) => q.topic).filter((t) => !a.topicsCovered.includes(t));
    expect(uncovered).toEqual(["volume_spikes", "one_fix"]); // the consultant never asked either
  });
});

describe("Cedar Ridge regression fixture (a second, different call)", () => {
  const a = analyze(cedar);

  it("the generalised rules still read the HVAC call correctly", () => {
    expect(a.painPoints.map((p) => p.id)).toEqual(["manual_entry", "lead_followup", "billing", "visibility", "disconnected_tools", "capacity"]);
    expect(a.painPoints[0]).toMatchObject({ id: "manual_entry", severity: "high", impact: "about 15 hours per week" });
    expect(a.money.map((m) => m.amount)).toEqual([9500, 120000, 85, 45, 16, 60, 2400, 15000]);
    expect(computeTotals(a.tech)).toEqual({ monthly: 206, annual: 2472, toolsWithCost: 4, toolsTotal: 5 });
  });

  it("keeps the one-time setup fee off the QuickBooks line", () => {
    expect(a.tech.find((t) => t.tool === "QuickBooks")?.monthlyCost).toBe(85);
  });

  it("finds budget, urgency and the owner as decision factors", () => {
    expect(a.facts.budget?.quote).toMatch(/\$15,000/);
    expect(a.facts.urgency?.quote).toMatch(/need this fixed/);
    expect(a.facts.decision?.role).toBe("maker");
    expect(a.timeline).toEqual({ deadline: null, window: "the next 60 days" });
    expect(a.objections).toHaveLength(1);
    expect(a.readiness.score).toBe(67);
  });

  it("adapts the follow-up to the noun the client used", () => {
    expect(a.followUp?.text).toBe("What is one recovered estimate request worth to you in revenue?");
  });
});

describe("live behaviour as the call plays", () => {
  it("topic coverage only ever grows as segments arrive", () => {
    for (const call of [demo, cedar]) {
      let previous = new Set<string>();
      for (let n = 1; n <= call.length; n++) {
        const covered = new Set(analyze(call.slice(0, n)).topicsCovered);
        for (const topic of previous) expect(covered.has(topic), `${topic} dropped at segment ${n}`).toBe(true);
        previous = covered;
      }
    }
  });

  it("questions are detected near where they come up, not all at once", () => {
    expect(analyze(demo.slice(0, 4)).topicsCovered).toEqual(["context", "time_sinks", "manual_processes", "quality_dips"]);
    expect(analyze(demo.slice(0, 4)).signals).toHaveLength(0);
    expect(analyze(demo.slice(0, 7)).topicsCovered).toContain("tool_stack"); // asked at segment 7
    expect(analyze(demo.slice(0, 6)).topicsCovered).not.toContain("tool_stack");
  });

  it("readiness jumps when the client names the deadline and who decides, then nets out the objection", () => {
    const score = (n: number) => analyze(demo.slice(0, n)).readiness.score;
    expect(score(15)).toBe(33);
    expect(score(16)).toBe(68); // "It's just me ... by mid-November": +15 decision-maker, +20 urgency
    expect(score(18)).toBe(70); // +10 two buying signals, -8 objection
    const series = demo.map((_, i) => score(i + 1));
    expect(series[0]).toBe(0);
    expect(Math.max(...series)).toBe(70);
  });

  it("a follow-up outranks the bank until the consultant asks it", () => {
    expect(analyze(demo.slice(0, 5)).nextQuestion.text).toBe("What breaks first when volume spikes?");
    expect(analyze(demo.slice(0, 6)).nextQuestion.text).toMatch(/recovered lead worth/);
    const asked = [...demo, consultant("Last thing: what is one lead worth to you?", 20)];
    expect(analyze(asked).followUp).toBeNull();
    expect(analyze(asked).nextQuestion.text).toBe("What breaks first when volume spikes?");
  });

  it("falls back to the bank, then to a closing recap", () => {
    expect(pickNextQuestion(new Set()).topic).toBe("context");
    expect(pickNextQuestion(new Set(["context", "time_sinks"])).topic).toBe("manual_processes");
    expect(pickNextQuestion(new Set(QUESTION_BANK.map((q) => q.topic))).topic).toBeNull();
  });

  it("reports an honest empty state for an empty call", () => {
    const a = analyze([]);
    expect(a.painPoints).toEqual([]);
    expect(a.readiness.score).toBe(0);
    expect(a.readiness.reason).toMatch(/Nothing heard yet/);
    expect(a.reflectBack).toMatch(/Keep listening/);
    expect(a.facts).toEqual({ budget: null, urgency: null, decision: null });
  });
});

describe("extraction rules", () => {
  it("ignores anything the consultant says (including their own prices)", () => {
    const a = analyze([consultant("Our retainer is $5,000 a month and we use HubSpot internally.", 0), client("Fine.", 1)]);
    expect(a.money).toEqual([]);
    expect(a.tech).toEqual([]);
  });

  it("converts annual and weekly bills to monthly", () => {
    const a = analyze([client("We pay $1,200 a year for Xero. Zapier is $10 a week.", 0)]);
    const xero = a.tech.find((t) => t.tool === "Xero");
    const zapier = a.tech.find((t) => t.tool === "Zapier");
    expect([xero?.monthlyCost, xero?.annualCost, xero?.note]).toEqual([100, 1200, "billed annually"]);
    expect([zapier?.monthlyCost, zapier?.annualCost]).toEqual([43.33, 520]);
  });

  it("assumes monthly only when the sentence reads like a subscription, and says so", () => {
    const a = analyze([client("Our HubSpot plan is $200.", 0), client("We spent $3,000 on a Salesforce consultant.", 1)]);
    expect(a.tech.find((t) => t.tool === "HubSpot")).toMatchObject({ monthlyCost: 200, note: "assumed monthly" });
    expect(a.tech.find((t) => t.tool === "Salesforce")?.monthlyCost).toBeNull();
  });

  it("pairs prices to tools clause by clause, whichever side the tool name is on", () => {
    const pairs = (text: string) => analyze([client(text, 0)]).tech.map((t) => [t.tool, t.monthlyCost]);
    expect(pairs("Slack costs $8 a month and Asana is $25 a month.")).toEqual([["Slack", 8], ["Asana", 25]]);
    expect(pairs("Then Asana at around $120 a month, Zapier at $99 a month — though half our zaps break.")).toEqual([["Asana", 120], ["Zapier", 99]]);
    expect(pairs("Dana pays $16 a month for Calendly, and we have Slack at about $60 a month.")).toEqual([["Calendly", 16], ["Slack", 60]]);
    expect(pairs("HubSpot is the big one — about $800 a month for the Marketing Hub, and we use a third of it.")).toEqual([["HubSpot", 800]]);
  });

  it("reads number words for time: 'ten to twelve hours a week', 'two full days a week'", () => {
    const impact = (text: string) => analyze([client(text, 0)]).painPoints[0]?.impact;
    expect(impact("It takes ten to twelve hours a week to build reports by hand.")).toBe("about 10–12 hours per week");
    expect(impact("My account manager spends two full days a week building reports by hand.")).toBe("about 2 days per week");
    expect(impact("We lose 15 hours a week re-entering jobs.")).toBe("about 15 hours per week");
  });

  it("lets a follow-on sentence lend its intensity and money to the problem it follows", () => {
    const a = analyze([client("Our reports are built by hand. That was embarrassing. We could be saving $2,000 a month.", 0)]);
    expect(a.painPoints[0]).toMatchObject({ id: "manual_reporting" });
    const bare = analyze([client("Our reports are built by hand.", 0)]).painPoints[0]!;
    expect(bare.severity).toBe("low");
    expect(a.painPoints[0]!.severity).toBe("medium"); // +2 "embarrassing", +1 a stated dollar figure
  });

  it("parses k/thousand suffixes and cents", () => {
    expect(findMoney("about $4.5k").map((m) => m.amount)).toEqual([4500]);
    expect(findMoney("$12.50 each").map((m) => m.amount)).toEqual([12.5]);
    expect(findMoney("no money here")).toEqual([]);
  });

  it("does not split sentences on dollar decimals", () => {
    expect(splitSentences("It costs $9.50 today. Fine!")).toEqual(["It costs $9.50 today.", "Fine!"]);
  });

  it("measures talk ratio by words", () => {
    const r = talkRatio([consultant("one two three", 0), client("a b c d e f g", 1)]);
    expect(r).toEqual({ consultantWords: 3, clientWords: 7, consultantPct: 30, clientPct: 70 });
    expect(talkRatio([])).toEqual({ consultantWords: 0, clientWords: 0, consultantPct: 0, clientPct: 0 });
  });
});
