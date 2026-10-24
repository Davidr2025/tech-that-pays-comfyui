import { describe, expect, it } from "vitest";
import { ASSESSMENT_SEGMENTS } from "@/lib/demo/assessment-call";
import { extractAssessment } from "@/lib/mock-ai/assessment";
import { bankFor } from "@/lib/mock-ai/banks";
import { analyze } from "@/lib/mock-ai/engine";
import type { Segment } from "@/lib/mock-ai/types";
import { computeTotals } from "@/lib/reveal/schema";

const segs: Segment[] = ASSESSMENT_SEGMENTS.map((s, order) => ({ ...s, order }));
const client = (text: string, order = 0) => ({ text, order });

describe("assessment demo call", () => {
  const a = analyze(segs, { type: "COMBINED_ASSESSMENT" });
  const covered = (type: "OPERATIONAL_ASSESSMENT" | "TECHNOLOGY_ASSESSMENT" | "COMBINED_ASSESSMENT") =>
    bankFor(type).filter((q) => analyze(segs, { type }).topicsCovered.includes(q.topic)).map((q) => q.topic);

  it("is a real assessment-length call: 54 turns, the client carries about two thirds of the words", () => {
    expect(segs).toHaveLength(54);
    expect(a.talk.clientPct).toBeGreaterThanOrEqual(65);
    expect(a.talk.clientPct).toBeLessThanOrEqual(72);
  });

  it("auto-checks 36 of the 40 combined questions; the 4 left are ones the consultant never asked", () => {
    expect(a.topicsCovered).toHaveLength(36);
    const missed = bankFor("COMBINED_ASSESSMENT").map((q) => q.topic).filter((t) => !a.topicsCovered.includes(t));
    expect(missed).toEqual(["ops_priority", "tech_vendors", "tech_spend", "tech_datapath"]);
  });

  it("scores each assessment type against its own bank only", () => {
    expect(covered("OPERATIONAL_ASSESSMENT")).toHaveLength(19);
    expect(covered("TECHNOLOGY_ASSESSMENT")).toHaveLength(17);
    expect(covered("OPERATIONAL_ASSESSMENT").every((t) => t.startsWith("ops_"))).toBe(true);
    expect(covered("TECHNOLOGY_ASSESSMENT").every((t) => t.startsWith("tech_"))).toBe(true);
  });

  it("detects questions near where they are asked, not all at once", () => {
    const at = (n: number) => analyze(segs.slice(0, n), { type: "COMBINED_ASSESSMENT" }).topicsCovered;
    expect(at(1)).toEqual([]);
    expect(at(4)).toContain("ops_flow");
    expect(at(4)).not.toContain("tech_mfa");
    expect(at(segs.length - 2)).toContain("tech_wish");
    let previous = new Set<string>();
    for (let n = 1; n <= segs.length; n++) {
      const now = new Set(at(n));
      for (const t of previous) expect(now.has(t), `${t} dropped at ${n}`).toBe(true);
      previous = now;
    }
  });

  it("finds all four stated finance figures", () => {
    expect(a.assessment.finance).toEqual({ revenueMonthly: 95000, receivables: 38000, payrollMonthly: 41000, overheadMonthly: 4000 });
  });

  it("finds all 9 security and governance gaps, worst first (then in the order they came up), naming the tool where there was one", () => {
    expect(a.assessment.risks.map((r) => [r.id, r.severity])).toEqual([
      ["former_access", "high"],
      ["shared_logins", "high"],
      ["no_mfa", "high"],
      ["unapproved_ai", "high"],
      ["spreadsheet_dependency", "medium"],
      ["orphaned_account", "medium"],
      ["untested_backup", "medium"],
      ["personal_devices", "medium"],
      ["unwritten_knowledge", "low"],
    ]);
    expect(a.assessment.risks.find((r) => r.id === "shared_logins")?.tool).toBe("HubSpot");
    expect(a.assessment.risks.find((r) => r.id === "former_access")?.tool).toBe("Asana");
    expect(a.assessment.risks.find((r) => r.id === "orphaned_account")?.tool).toBe("Zapier");
  });

  it("maps the processes the client described, with weekly hours where they gave them", () => {
    const byId = Object.fromEntries(a.assessment.processes.map((p) => [p.id, p.hoursPerWeek]));
    expect(Object.keys(byId).sort()).toEqual(["billing", "content", "lead_intake", "onboarding", "payroll", "pipeline_review", "proposals", "reporting"]);
    expect(byId.content).toBe(5);
    expect(a.assessment.adminHoursPerWeek).toBe(25);
  });

  it("reads the channels they publish on", () => {
    expect(a.assessment.contentChannels).toEqual(["LinkedIn", "Email newsletter"]);
  });

  it("totals the tool stack: 7 costed tools, $1,304 a month", () => {
    expect(computeTotals(a.tech)).toEqual({ monthly: 1304, annual: 15648, toolsWithCost: 7, toolsTotal: 8 });
  });

  it("keeps the contractor's cost, not the revenue, as the outsourcing impact", () => {
    // Regression: "Our revenue is about $95,000 a month" follows the contractor sentence. It is
    // context, not a cost of the problem, and must not become the pain's stated impact.
    expect(a.painPoints.find((p) => p.id === "outsourcing_cost")?.impact).toBe("about $4,000 per month");
  });

  it("finds the one objection: the Zapier build that broke", () => {
    expect(a.objections).toHaveLength(1);
    expect(a.objections[0]?.quote).toMatch(/broke during a launch/);
  });
});

describe("assessment extraction rules", () => {
  const tools = ["HubSpot", "Zapier"];
  const risks = (text: string) => extractAssessment([client(text)], tools).risks.map((r) => r.id);

  it("reads each security gap from the way clients actually say it", () => {
    expect(risks("Everyone shares one login that's in a doc.")).toEqual(["shared_logins"]);
    expect(risks("We don't have multi-factor turned on.")).toEqual(["no_mfa"]);
    expect(risks("Nobody has two-factor on anything.")).toEqual(["no_mfa"]);
    expect(risks("Our old designer still has access to the HubSpot account.")).toEqual(["former_access"]);
    expect(risks("Two people paste client reports into ChatGPT.")).toEqual(["unapproved_ai"]);
    expect(risks("We have never tested a restore.")).toEqual(["untested_backup"]);
    expect(risks("Everyone uses their own laptops.")).toEqual(["personal_devices"]);
  });

  it("does not raise a gap from a sentence that mentions the topic fine", () => {
    expect(risks("We turned on multi-factor for everyone last year.")).toEqual([]);
    expect(risks("Backups run nightly and we test a restore every quarter.")).toEqual([]);
    expect(risks("We use ChatGPT for brainstorming blog titles.")).toEqual([]);
  });

  it("classifies money by what it is: receivables, payroll, revenue, contractors", () => {
    const f = extractAssessment(
      [client("We have $12,000 outstanding."), client("Payroll is $30,000 a month."), client("Revenue is about $240,000 a year."), client("We pay a freelancer $2,000 a month.")],
      [],
    ).finance;
    expect(f).toEqual({ revenueMonthly: 20000, receivables: 12000, payrollMonthly: 30000, overheadMonthly: 2000 });
  });

  it("does not mistake money 'left on the table' for revenue", () => {
    expect(extractAssessment([client("We're leaving $150,000 a year in revenue on the table.")], []).finance.revenueMonthly).toBeNull();
  });

  it("returns honest empties when nothing was said", () => {
    expect(extractAssessment([], [])).toEqual({
      processes: [],
      risks: [],
      finance: { revenueMonthly: null, receivables: null, payrollMonthly: null, overheadMonthly: null },
      contentChannels: [],
      adminHoursPerWeek: null,
    });
  });

  it("only mines the client: a consultant's question about passwords is not a finding", () => {
    const a = analyze([
      { speaker: "CONSULTANT", text: "Does everyone share one login? Is multi-factor off?", order: 0 },
      { speaker: "CLIENT", text: "No, we're fine.", order: 1 },
    ], { type: "TECHNOLOGY_ASSESSMENT" });
    expect(a.assessment.risks).toEqual([]);
  });
});
