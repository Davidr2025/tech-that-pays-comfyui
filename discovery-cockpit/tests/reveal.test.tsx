import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RevealView } from "@/components/reveal/reveal-view";
import { DEMO_SEGMENTS } from "@/lib/demo/demo-call";
import { analyze } from "@/lib/mock-ai/engine";
import { buildRevealData } from "@/lib/reveal/build";
import { computeTotals, revealSchema } from "@/lib/reveal/schema";

const consultant = { name: "Avery Quinn", businessName: "Quinn Ops", tagline: null, brandColor: "#0f766e" };
const client = { name: "Priya", companyName: "Brightline" };
const when = new Date("2026-01-15T12:00:00Z");

const demoAnalysis = analyze(DEMO_SEGMENTS.map((s, order) => ({ ...s, order })));

describe("buildRevealData", () => {
  const data = buildRevealData({ consultant, client, analysis: demoAnalysis, generatedAt: when });

  it("computes monthly and annual totals from the rows with a stated cost", () => {
    expect(data.totals).toEqual({ monthly: 1174, annual: 14088, toolsWithCost: 5, toolsTotal: 6 });
    expect(data.techStack.filter((t) => t.monthlyCost !== null).map((t) => t.monthlyCost)).toEqual([800, 120, 99, 20, 135]);
  });

  it("includes every dollar amount the client mentioned, with context", () => {
    expect(data.moneyMentioned).toHaveLength(9);
    expect(data.moneyMentioned.find((m) => m.amount === 150000)?.context).toContain("on the table");
    expect(data.moneyMentioned.find((m) => m.amount === 48000)?.context).toContain("a system should be doing");
  });

  it("phrases pain points neutrally (never the client's raw words)", () => {
    expect(data.painPoints.map((p) => p.title)).toContain("Manual, time-consuming reporting");
    const all = JSON.stringify(data.painPoints);
    expect(all).not.toMatch(/drowning|kills me|felt sick|burning out|embarrass/i);
    expect(data.painPoints[0]?.detail).toContain("Reported impact: about 10–12 hours per week.");
  });

  it("carries the client's deadline as the driving timeline, as date phrases only", () => {
    expect(data.timeline).toEqual({ deadline: "mid-November", window: "the next two to three weeks" });
    expect(data.summary).toContain("Your target date is mid-November.");
    expect(JSON.stringify(data)).not.toContain("the dental group wants"); // the sentence stays private
  });

  it("states the future state the pack calls for (automated reporting, fast lead replies)", () => {
    expect(data.futureState).toContain("Reports build themselves from connected data sources and arrive on schedule.");
    expect(data.futureState).toContain("Every new lead gets a reply within minutes and is tracked until it is won or closed.");
    expect(data.currentState).toContain("Reports are built by hand each period from several separate exports.");
  });

  it("words the summary correctly when every tool, or only some, has a cost", () => {
    expect(data.summary).toContain("Among the 5 tools with a stated cost, the subscriptions total about $1,174 per month ($14,088 per year)");
    const one = buildRevealData({ consultant, client, analysis: analyze([{ speaker: "CLIENT", text: "Calendly is $50 a month.", order: 0 }]), generatedAt: when });
    expect(one.summary).toContain("uses 1 tool. Their subscriptions total about $50 per month ($600 per year)");
    expect(renderToStaticMarkup(<RevealView data={one} />)).toContain("Totals include all 1 tool.");
  });

  it("is valid against the strict schema and has a current and future state", () => {
    expect(revealSchema.safeParse(data).success).toBe(true);
    expect(data.currentState.length).toBeGreaterThan(2);
    expect(data.futureState.length).toBeGreaterThan(2);
  });
});

describe("totals integrity", () => {
  it("rejects a payload whose totals don't match its rows", () => {
    const data = buildRevealData({ consultant, client, analysis: demoAnalysis, generatedAt: when });
    expect(revealSchema.safeParse({ ...data, totals: { ...data.totals, monthly: 999 } }).success).toBe(false);
    expect(revealSchema.safeParse({ ...data, totals: { ...data.totals, annual: 1 } }).success).toBe(false);
  });

  it("sums in integer cents so annual-billed tools don't drift", () => {
    const rows = [
      { monthlyCost: 83.33, annualCost: 1000 },
      { monthlyCost: 0.1, annualCost: 1.2 },
      { monthlyCost: 0.2, annualCost: 2.4 },
      { monthlyCost: null, annualCost: null },
    ];
    expect(computeTotals(rows)).toEqual({ monthly: 83.63, annual: 1003.6, toolsWithCost: 3, toolsTotal: 4 });
  });
});

describe("RevealView", () => {
  it("shows the totals and every section for the demo call", () => {
    const html = renderToStaticMarkup(<RevealView data={buildRevealData({ consultant, client, analysis: demoAnalysis, generatedAt: when })} />);
    for (const heading of ["What We Heard", "The Numbers You Mentioned", "Your Current Tools", "Where You Are Today vs. Where You Could Be"]) {
      expect(html).toContain(heading.replace("&", "&amp;"));
    }
    expect(html).toMatch(/data-testid="total-monthly">\$1,174</);
    expect(html).toMatch(/data-testid="total-annual">\$14,088</);
    expect(html).toContain("Target date");
    expect(html).toContain("mid-November");
    expect(html).toContain("Not stated"); // Google Sheets: a tool with no stated cost
    expect(html).toContain("5 of 6 tools");
    expect(html).toContain("Quinn Ops");
  });

  it("says plainly when nothing was captured instead of inventing content", () => {
    const empty = buildRevealData({ consultant, client, analysis: analyze([{ speaker: "CLIENT", text: "Hello there.", order: 0 }]), generatedAt: when });
    const html = renderToStaticMarkup(<RevealView data={empty} />);
    expect(html).toContain("No specific challenges were captured");
    expect(html).toContain("No dollar figures were mentioned");
    expect(html).toContain("No software tools were named");
    expect(html).not.toContain("<table");
  });
});
