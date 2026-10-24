/** The grounding layer: what a model's answer must prove against the transcript before the app uses any of it. */
import { describe, expect, it } from "vitest";
import { applyDelta, locate, normalise, toAnalysis } from "@/lib/ai/ground";
import { emptyState, stateSchema } from "@/lib/ai/schemas";
import { DEMO_SEGMENTS } from "@/lib/demo/demo-call";
import { computeTimeEstimate, timeSinksFrom } from "@/lib/reveal/roi";
import type { Segment } from "@/lib/mock-ai/types";
import { CONSULTANT_LINE, delta, REPORT_FIGURE, URGENCY } from "./ai-fixtures";

const segments: Segment[] = DEMO_SEGMENTS.map((s, order) => ({ ...s, order }));
const topics = new Set(["context", "time_sinks", "tool_stack", "decision_timeline"]);

describe("locate", () => {
  it("finds a client sentence whatever the punctuation or case", () => {
    expect(locate("its easily ten to twelve hours a week and if shes sick nobody else knows the process", segments)?.sentence).toBe(REPORT_FIGURE);
    expect(locate(REPORT_FIGURE.toUpperCase(), segments)?.order).toBe(3);
  });
  it("never finds what only the consultant said", () => {
    expect(locate(CONSULTANT_LINE, segments)).toBeNull();
  });
  it("never finds what nobody said, or a fragment too short to mean anything", () => {
    expect(locate("We spend nine hours a week on invoices.", segments)).toBeNull();
    expect(locate("hours", segments)).toBeNull();
  });
  it("normalise keeps digits, letters and money signs only", () => {
    expect(normalise("“It’s $4,000 — a month!”")).toBe("its $4 000 a month");
  });
});

describe("applyDelta", () => {
  it("accepts grounded findings and reads every figure out of the client's sentence", () => {
    const { state, dropped } = applyDelta(null, delta(), segments, topics);
    expect(dropped).toBe(0);
    const a = toAnalysis(state, segments, "DISCOVERY");
    const reporting = a.painPoints.find((p) => p.id === "manual_reporting")!;
    expect(reporting).toMatchObject({ impact: "about 10–12 hours per week", weeklyHours: 10, hoursSource: REPORT_FIGURE, quantified: true, severity: "high" });
    const upwork = a.painPoints.find((p) => p.id === "outsourcing_cost")!;
    expect(upwork).toMatchObject({ impact: "about $4,000 per month", annualAmount: 48000 });
    expect(a.tech).toEqual([expect.objectContaining({ tool: "HubSpot", monthlyCost: 800, annualCost: 9600, segmentOrder: 5 })]);
    expect(a.timeline.deadline).toBe("mid-November");
    expect(a.facts.decision).toMatchObject({ role: "maker", kind: "Decision-maker" });
    expect(a.readiness).toMatchObject({ score: 70, tier: "ready", factors: [] });
    expect(a.topicsCovered).toEqual(["time_sinks", "tool_stack"]);
    expect(a.nextQuestion.text).toBe("What is one recovered lead worth to you?");
  });

  it("the estimate built from a Claude analysis counts each statement once, like the rule-based one", () => {
    const { state } = applyDelta(null, delta(), segments, topics);
    const a = toAnalysis(state, segments, "DISCOVERY");
    const sinks = timeSinksFrom(a);
    expect(sinks).toEqual([{ title: "Manual, time-consuming reporting", hoursPerWeek: 10 }]);
    expect(computeTimeEstimate(sinks, 60)?.hoursPerYear).toBe(480);
  });

  it("drops a quote the client never said, and says how many", () => {
    const d = delta({ painPoints: [{ category: "billing", quote: "We never get paid on time and it keeps me up at night.", figureQuote: null, severity: "high" }] });
    const { state, dropped } = applyDelta(null, d, segments, topics);
    expect(state.pains).toEqual([]);
    expect(dropped).toBe(1);
  });

  it("does not let the consultant's words become a finding", () => {
    const d = delta({ painPoints: [{ category: "manual_reporting", quote: CONSULTANT_LINE, figureQuote: null, severity: "high" }], signals: [{ kind: "Ready", quote: "I'm not pitching; at the end I'll tell you straight whether an assessment makes sense." }] });
    const { state, dropped } = applyDelta(null, d, segments, topics);
    expect(state.pains).toEqual([]);
    expect(state.signals).toEqual([]);
    expect(dropped).toBe(2);
  });

  it("keeps a problem whose figure is invented, without the figure", () => {
    const d = delta({ painPoints: [{ category: "manual_reporting", quote: "Last month a report went out with the wrong month's numbers and the client spotted it before we did.", figureQuote: "It takes my team forty hours a week.", severity: "medium" }] });
    const { state, dropped } = applyDelta(null, d, segments, topics);
    const a = toAnalysis(state, segments, "DISCOVERY");
    expect(a.painPoints[0]).toMatchObject({ id: "manual_reporting", impact: null, weeklyHours: null, quantified: false });
    expect(dropped).toBe(1);
  });

  it("ignores a tool the client never named, a cost the sentence does not support, and topics off the checklist", () => {
    const d = delta({
      techStack: [
        { tool: "Basecamp", purpose: "Projects", costQuote: null },
        { tool: "HubSpot", purpose: "CRM", costQuote: "Priya, thanks for jumping on." },
      ],
      questionsCovered: ["time_sinks", "made_up_topic"],
    });
    const { state, dropped } = applyDelta(null, d, segments, topics);
    expect(state.tech.map((t) => [t.tool, t.monthlyCost])).toEqual([["HubSpot", null]]);
    expect(state.covered).toEqual(["time_sinks"]);
    expect(dropped).toBe(3);
  });

  it("merges later answers: first quote stays, severity only rises, a figure fills a gap, facts are not overwritten", () => {
    const first = applyDelta(null, delta({ painPoints: [{ category: "manual_reporting", quote: "Last month a report went out with the wrong month's numbers and the client spotted it before we did.", figureQuote: null, severity: "low" }] }), segments, topics).state;
    expect(first.pains[0]).toMatchObject({ severity: "low", figureQuote: null, mentions: 1 });
    const second = applyDelta(first, delta({ facts: { budgetQuote: null, urgencyQuote: null, decisionQuote: "My business partner handles finance but he trusts my call on operations.", decisionRole: "shared" } }), segments, topics).state;
    expect(second.pains[0]).toMatchObject({ severity: "high", figureQuote: REPORT_FIGURE, mentions: 2, quote: first.pains[0]!.quote });
    expect(second.facts.decision?.role).toBe("maker"); // "shared" does not downgrade "maker"
    expect(second.facts.urgency?.quote).toBe(URGENCY); // kept although this answer had none
    expect(first.facts.urgency?.quote).toBe(URGENCY);
  });

  it("does not modify its inputs", () => {
    const before = emptyState();
    const snapshot = JSON.stringify(before);
    applyDelta(before, delta(), segments, topics);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("produces state that passes its own stored-state schema, and rejects a tampered one", () => {
    const { state } = applyDelta(null, delta(), segments, topics);
    expect(stateSchema.safeParse(state).success).toBe(true);
    expect(stateSchema.safeParse({ ...state, extra: 1 }).success).toBe(false);
    expect(stateSchema.safeParse({ ...state, pains: [{ ...state.pains[0], id: "not_a_category" }] }).success).toBe(false);
  });
});

describe("toAnalysis with nothing heard", () => {
  it("is a calm empty analysis", () => {
    const a = toAnalysis(emptyState(), [], "DISCOVERY");
    expect(a.painPoints).toEqual([]);
    expect(a.readiness).toMatchObject({ score: 0, tier: "early" });
    expect(a.nextQuestion.topic).toBe("context");
  });
});
