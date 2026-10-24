import { describe, expect, it } from "vitest";
import { DEMO_SEGMENTS } from "@/lib/demo/demo-call";
import { analyze, findMoney, pickNextQuestion, splitSentences, talkRatio } from "@/lib/mock-ai/engine";
import { QUESTION_BANK } from "@/lib/mock-ai/questions";
import type { Segment } from "@/lib/mock-ai/types";
import { computeTotals } from "@/lib/reveal/schema";

const demo: Segment[] = DEMO_SEGMENTS.map((s, order) => ({ ...s, order }));
const client = (text: string, order = 0): Segment => ({ speaker: "CLIENT", text, order });
const consultant = (text: string, order = 0): Segment => ({ speaker: "CONSULTANT", text, order });

describe("demo call meets the starter spec", () => {
  const a = analyze(demo);

  it("finds real pain points with severities", () => {
    expect(a.painPoints.map((p) => [p.id, p.severity])).toEqual([
      ["manual_entry", "high"],
      ["lead_followup", "medium"],
      ["visibility", "medium"],
      ["billing", "medium"],
      ["capacity", "medium"],
      ["disconnected_tools", "low"],
    ]);
    expect(a.painPoints[0]?.impact).toBe("about 15 hours per week");
  });

  it("finds at least 3 dollar amounts, with periods", () => {
    expect(a.money.map((m) => [m.amount, m.period])).toEqual([
      [9500, "unspecified"],
      [120000, "year"],
      [85, "month"],
      [45, "month"],
      [16, "month"],
      [60, "month"],
      [2400, "unspecified"],
      [15000, "year"],
    ]);
  });

  it("finds 4+ tools with costs and totals them correctly", () => {
    const costed = a.tech.filter((t) => t.monthlyCost !== null);
    expect(costed.map((t) => [t.tool, t.monthlyCost, t.annualCost])).toEqual([
      ["QuickBooks", 85, 1020],
      ["Mailchimp", 45, 540],
      ["Calendly", 16, 192],
      ["Slack", 60, 720],
    ]);
    expect(a.tech.find((t) => t.tool === "Google Sheets")?.monthlyCost).toBeNull();
    expect(computeTotals(a.tech)).toEqual({ monthly: 206, annual: 2472, toolsWithCost: 4, toolsTotal: 5 });
  });

  it("does not mistake a one-time setup fee for a subscription cost", () => {
    // The $2,400 sentence names QuickBooks but is a one-off fee.
    expect(a.tech.find((t) => t.tool === "QuickBooks")?.monthlyCost).toBe(85);
  });

  it("finds exactly 2 buying signals and 1 objection", () => {
    expect(a.signals.map((s) => s.kind)).toEqual(["Urgency", "Budget"]);
    expect(a.objections.map((o) => o.kind)).toEqual(["Past bad experience"]);
  });

  it("covers every bank question by the end and scores readiness", () => {
    expect(a.topicsCovered).toEqual(QUESTION_BANK.map((q) => q.topic));
    expect(a.readiness.score).toBe(77);
    expect(a.readiness.tier).toBe("ready");
    expect(a.readiness.reason).toContain("Budget, urgency and decision-maker confirmed");
  });
});

describe("live behaviour as the call plays", () => {
  it("topic coverage only ever grows as segments arrive", () => {
    let previous = new Set<string>();
    for (let n = 1; n <= demo.length; n++) {
      const covered = new Set(analyze(demo.slice(0, n)).topicsCovered);
      for (const topic of previous) expect(covered.has(topic), `${topic} dropped at segment ${n}`).toBe(true);
      previous = covered;
    }
  });

  it("questions are detected near where they come up, not all at once", () => {
    const early = analyze(demo.slice(0, 4)).topicsCovered;
    expect(early).toEqual(["overview", "team", "process", "pain"]);
    expect(analyze(demo.slice(0, 4)).signals).toHaveLength(0);
  });

  it("readiness climbs as budget and urgency are revealed", () => {
    const scores = [4, 16, 18, demo.length].map((n) => analyze(demo.slice(0, n)).readiness.score);
    expect(scores).toEqual([...scores].sort((x, y) => x - y));
    expect(scores[0]).toBeLessThan(scores[scores.length - 1]!);
  });

  it("suggests the first uncovered question, then a closing recap", () => {
    expect(pickNextQuestion(new Set()).topic).toBe("overview");
    expect(pickNextQuestion(new Set(["overview", "team"])).topic).toBe("process");
    expect(pickNextQuestion(new Set(QUESTION_BANK.map((q) => q.topic))).topic).toBeNull();
  });

  it("reports an honest empty state for an empty call", () => {
    const a = analyze([]);
    expect(a.painPoints).toEqual([]);
    expect(a.readiness.score).toBe(0);
    expect(a.readiness.reason).toMatch(/Nothing heard yet/);
    expect(a.reflectBack).toMatch(/Keep listening/);
  });
});

describe("extraction rules", () => {
  it("ignores anything the consultant says (including their own prices)", () => {
    const a = analyze([
      consultant("Our retainer is $5,000 a month and we use HubSpot internally.", 0),
      client("Fine.", 1),
    ]);
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

  it("attaches each amount to the nearest tool in the sentence", () => {
    const a = analyze([client("Slack costs $8 a month and Asana is $25 a month.", 0)]);
    expect(a.tech.map((t) => [t.tool, t.monthlyCost])).toEqual([
      ["Slack", 8],
      ["Asana", 25],
    ]);
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
