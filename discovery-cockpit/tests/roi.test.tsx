import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { RevealView } from "@/components/reveal/reveal-view";
import { prisma } from "@/lib/db";
import { ASSESSMENT_SEGMENTS } from "@/lib/demo/assessment-call";
import { DEMO_SEGMENTS } from "@/lib/demo/demo-call";
import { analyze } from "@/lib/mock-ai/engine";
import { buildRevealData } from "@/lib/reveal/build";
import { computeTimeEstimate, RECOVERY_RATE, statedCostsFrom, timeSinksFrom, WEEKS_PER_YEAR } from "@/lib/reveal/roi";
import { revealSchema, type RevealData } from "@/lib/reveal/schema";
import type { SessionType } from "@/lib/session-types";
import { buildClientReview } from "@/server/review";
import { getRevealPayload } from "@/server/reveal";
import { CEDAR_SEGMENTS } from "./fixtures/cedar-ridge";
import { htmlToText, makeDemoSession } from "./helpers";

const analysisOf = (segs: { speaker: "CONSULTANT" | "CLIENT"; text: string }[], type: SessionType = "DISCOVERY") =>
  analyze(segs.map((s, order) => ({ ...s, order })), { type });

const base = {
  consultant: { name: "Avery Quinn", businessName: "Quinn Studio", tagline: null },
  branding: { primaryColor: "#0f766e", accentColor: "#d97706", logoUrl: null },
  client: { name: "Priya", companyName: "Brightline" },
  generatedAt: new Date("2026-10-24T12:00:00Z"),
};
const build = (segs: Parameters<typeof analysisOf>[0], extra: { hourlyValue?: number | null; bookingUrl?: string | null; type?: SessionType } = {}) =>
  buildRevealData({ ...base, analysis: analysisOf(segs, extra.type), kind: extra.type, hourlyValue: extra.hourlyValue, bookingUrl: extra.bookingUrl });

describe("which hours count", () => {
  it("uses the low end of a stated range", () => {
    // "easily ten to twelve hours a week" -> 10, not 12
    const sinks = timeSinksFrom(analysisOf(DEMO_SEGMENTS));
    expect(sinks).toEqual([{ title: expect.any(String), hoursPerWeek: 10 }]);
  });

  it("counts one statement once even when it describes two problems", () => {
    const a = analysisOf(CEDAR_SEGMENTS);
    const withHours = a.painPoints.filter((p) => p.weeklyHours !== null);
    expect(withHours.length).toBeGreaterThanOrEqual(2); // the fixture's 15 hours feeds two categories
    expect(new Set(withHours.map((p) => p.hoursSource)).size).toBe(1);
    const sinks = timeSinksFrom(a);
    expect(sinks).toHaveLength(1);
    expect(sinks[0]!.hoursPerWeek).toBe(15);
  });

  it("falls back to a team-wide admin figure only when no problem has its own hours", () => {
    const a = analysisOf(ASSESSMENT_SEGMENTS, "COMBINED_ASSESSMENT");
    expect(a.painPoints.every((p) => p.weeklyHours === null)).toBe(true);
    expect(timeSinksFrom(a)).toEqual([{ title: "Administrative work across the team", hoursPerWeek: 25 }]);
    // with per-problem hours present, the admin figure is NOT added on top
    const mixed = timeSinksFrom({ painPoints: analysisOf(DEMO_SEGMENTS).painPoints, assessment: { ...a.assessment, adminHoursPerWeek: 25 } });
    expect(mixed.map((s) => s.hoursPerWeek)).toEqual([10]);
  });

  it("reports stated costs per problem, annualised, with the client's own wording", () => {
    const costs = statedCostsFrom(analysisOf(ASSESSMENT_SEGMENTS, "COMBINED_ASSESSMENT"));
    const contractor = costs.find((c) => c.annualAmount === 48000)!;
    expect(contractor.stated).toBe("about $4,000 per month");
  });
});

describe("the estimate", () => {
  it("is plain arithmetic on the rows, with the labelled assumptions", () => {
    const t = computeTimeEstimate([{ title: "A", hoursPerWeek: 10 }, { title: "B", hoursPerWeek: 2.5 }], 60)!;
    expect(t.hoursPerWeek).toBe(12.5);
    expect(t.hoursPerYear).toBe(12.5 * WEEKS_PER_YEAR);
    expect(t.recoverableHoursPerYear).toBe(Math.round(600 * RECOVERY_RATE));
    expect(t.recoverableValue).toBe(300 * 60);
    expect(computeTimeEstimate([], 60)).toBeNull();
    expect(computeTimeEstimate([{ title: "A", hoursPerWeek: 10 }], null)!.recoverableValue).toBeNull();
  });

  it("puts a dollar value on hours only when an hourly value was set, and says it is an assumption", () => {
    const without = build(DEMO_SEGMENTS);
    expect(without.roi?.time).toMatchObject({ hoursPerWeek: 10, hoursPerYear: 480, recoverableHoursPerYear: 240, hourlyValue: null, recoverableValue: null });
    expect(without.roi?.assumptions.join(" ")).toContain("not converted to dollars");

    const withRate = build(DEMO_SEGMENTS, { hourlyValue: 60 });
    expect(withRate.roi?.time?.recoverableValue).toBe(14400);
    expect(withRate.roi?.assumptions.join(" ")).toMatch(/\$60 per hour\. That is an assumption, not a figure you stated/);
  });

  it("does not add stated costs together, and only says so when there is more than one", () => {
    const many = build(DEMO_SEGMENTS);
    expect(many.roi?.statedCosts.map((c) => c.annualAmount).sort((a, b) => a - b)).toEqual([48000, 150000]);
    expect(many.roi?.assumptions.join(" ")).toContain("not added together");
    expect(Object.keys(many.roi!)).not.toContain("totalCost");

    const one = build(ASSESSMENT_SEGMENTS, { type: "COMBINED_ASSESSMENT" });
    expect(one.roi?.statedCosts).toHaveLength(1);
    expect(one.roi?.assumptions.join(" ")).not.toContain("not added together");
  });

  it("is null when the client gave no figures to build on", () => {
    const d = build([{ speaker: "CLIENT", text: "We use a spreadsheet and it is fine." }]);
    expect(d.roi).toBeNull();
  });
});

describe("tampered or malformed payloads fail closed", () => {
  const good = () => JSON.parse(JSON.stringify(build(DEMO_SEGMENTS, { hourlyValue: 60, bookingUrl: "https://cal.example/avery" }))) as RevealData;

  it("accepts the untouched payload", () => {
    expect(revealSchema.safeParse(good()).success).toBe(true);
  });

  it.each([
    ["inflated recoverable value", (d: RevealData) => (d.roi!.time!.recoverableValue = 999999)],
    ["inflated hours per year", (d: RevealData) => (d.roi!.time!.hoursPerYear = 5000)],
    ["a row that no longer sums", (d: RevealData) => (d.roi!.time!.sinks[0]!.hoursPerWeek = 40)],
    ["an unknown key inside roi", (d: RevealData) => ((d.roi as unknown as Record<string, unknown>).confidence = "high")],
    ["an estimate with nothing under it", (d: RevealData) => (d.roi = { time: null, statedCosts: [], assumptions: [] })],
    ["a javascript: booking link", (d: RevealData) => (d.booking!.url = "javascript:alert(1)")],
    ["a data: booking link", (d: RevealData) => (d.booking!.url = "data:text/html,<script>1</script>")],
    ["a relative booking link", (d: RevealData) => (d.booking!.url = "/admin")],
    ["an unknown key on booking", (d: RevealData) => ((d.booking as unknown as Record<string, unknown>).notes = "x")],
    ["too many next steps", (d: RevealData) => (d.nextSteps = Array.from({ length: 7 }, (_, i) => `step ${i}`))],
  ])("rejects %s", (_name, mutate) => {
    const d = good();
    mutate(d);
    expect(revealSchema.safeParse(d).success).toBe(false);
  });

  it("still reads a report stored before these sections existed", () => {
    const old = good() as Partial<RevealData>;
    delete old.roi;
    delete old.nextSteps;
    delete old.booking;
    const parsed = revealSchema.parse(old);
    expect(parsed.roi).toBeNull();
    expect(parsed.nextSteps).toEqual([]);
    expect(parsed.booking).toBeNull();
  });
});

describe("next steps", () => {
  it("come from what was said and name the client's own deadline phrase", () => {
    const d = build(DEMO_SEGMENTS);
    expect(d.nextSteps.length).toBeLessThanOrEqual(6);
    expect(d.nextSteps.join(" ")).toContain("mid-November");
    expect(d.nextSteps.at(-1)).toBe("Book a follow-up call with Avery Quinn to walk through a proposed plan.");
  });

  it("never invents a deadline", () => {
    const d = build([{ speaker: "CLIENT", text: "We lose about 5 hours a week to manual data entry in our spreadsheet." }]);
    expect(d.nextSteps.join(" ")).not.toMatch(/Work back from/);
  });
});

describe("booking link: which one a client gets", () => {
  async function review(consultantLink: string | null, clientLink: string | null) {
    const s = await makeDemoSession("booking");
    await prisma.consultant.update({ where: { id: s.consultantId }, data: { calendarLink: consultantLink } });
    await prisma.client.update({ where: { id: s.clientId }, data: { calendarLink: clientLink, hourlyValue: 80 } });
    await buildClientReview(s.id);
    return (await getRevealPayload(s.id))!;
  }

  it("prefers the client-specific link over the consultant's default", async () => {
    expect((await review("https://default.example/me", "https://client.example/book")).booking?.url).toBe("https://client.example/book");
  });
  it("falls back to the consultant's default", async () => {
    expect((await review("https://default.example/me", null)).booking?.url).toBe("https://default.example/me");
  });
  it("shows no booking section at all when neither is set", async () => {
    const p = await review(null, null);
    expect(p.booking).toBeNull();
    expect(htmlToText(renderToStaticMarkup(<RevealView data={p} />))).not.toContain("Book a call");
  });
  it("carries the client's hourly value into the stored estimate", async () => {
    const p = await review(null, null);
    expect(p.roi?.time).toMatchObject({ hourlyValue: 80, recoverableValue: 240 * 80 });
  });
});

describe("rendered sections", () => {
  let data: RevealData;
  let html: string;
  let text: string;
  beforeAll(() => {
    data = build(DEMO_SEGMENTS, { hourlyValue: 60, bookingUrl: "https://cal.example/avery?x=1&y=2" });
    html = renderToStaticMarkup(<RevealView data={data} />);
    text = htmlToText(html);
  });

  it("shows the estimate labelled as an estimate, with its assumptions", () => {
    expect(text).toContain("What This Could Be Worth");
    expect(text).toContain("480 hours a year");
    expect(text).toContain("Could be recovered (estimate)");
    expect(text).toContain("240 hours a year");
    expect(text).toContain("$14,400 a year");
    expect(text).toContain("an assumption, not a figure you stated");
  });

  it("renders the booking link safely", () => {
    const m = html.match(/<a href="([^"]+)"[^>]*data-testid="booking-link"/) ?? html.match(/<a[^>]*data-testid="booking-link"[^>]*>/);
    expect(m).toBeTruthy();
    const tag = html.match(/<a[^>]*data-testid="booking-link"[^>]*>/)![0];
    expect(tag).toContain('href="https://cal.example/avery?x=1&amp;y=2"');
    expect(tag).toContain('rel="noopener noreferrer"');
    expect(tag).toContain('target="_blank"');
    expect(text).toContain("Book a call with Avery Quinn");
  });

  it("lists the next steps in order", () => {
    expect(text).toContain("Next Steps");
    expect(html.indexOf("Next Steps")).toBeGreaterThan(html.indexOf("Your Current Tools"));
  });

  it("omits the section entirely when there is no estimate", () => {
    const d = build([{ speaker: "CLIENT", text: "We use a spreadsheet and it is fine." }]);
    expect(htmlToText(renderToStaticMarkup(<RevealView data={d} />))).not.toContain("What This Could Be Worth");
  });
});
