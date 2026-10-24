/**
 * Exports (plain text, HTML for pasting, the follow-up email) and the share route.
 * The promise they share with the reveal: they are built from the allow-listed payload only.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { GET as shareRoute } from "@/app/api/sessions/[id]/share/route";
import { prisma } from "@/lib/db";
import { DEMO_SEGMENTS } from "@/lib/demo/demo-call";
import { mailtoHref, mailtoProvider, MAILTO_MAX, type EmailMessage } from "@/lib/email";
import { analyze } from "@/lib/mock-ai/engine";
import { buildRevealData } from "@/lib/reveal/build";
import { buildEmailContent, esc, revealToHtml, revealToText } from "@/lib/reveal/export";
import { revealSchema, type RevealData } from "@/lib/reveal/schema";
import { buildClientReview } from "@/server/review";
import { getShareKit } from "@/server/share";
import { findLeaks, FORBIDDEN_TEXT, makeDemoSession } from "./helpers";

const SENTINEL_NOTES = "SENTINEL-EXPORT-NOTES-5b21d9";
const SENTINEL_COACH = "SENTINEL-EXPORT-COACH-90ac17";
const SENTINEL_QNOTE = "SENTINEL-EXPORT-QNOTE-3d70ee";

const demo = (): RevealData =>
  buildRevealData({
    consultant: { name: "Avery Quinn", businessName: "Quinn Studio", tagline: "Practical systems" },
    branding: { primaryColor: "#0f766e", accentColor: "#d97706", logoUrl: null },
    client: { name: "Priya Nair", companyName: "Brightline Marketing" },
    analysis: analyze(DEMO_SEGMENTS.map((s, order) => ({ ...s, order })), { type: "DISCOVERY" }),
    generatedAt: new Date("2026-10-24T12:00:00Z"),
    hourlyValue: 60,
    bookingUrl: "https://cal.example/avery",
  });

/**
 * The HTML export must be inert. Checked structurally: every real tag must be on a short
 * allow-list, carry only style (or an http(s) href on a link), and nothing may load or run.
 * Escaped text such as "&lt;img onerror=..." is just text, so it is not a tag.
 */
const TAGS = new Set(["div", "p", "h2", "ul", "ol", "li", "strong", "table", "thead", "tbody", "tr", "th", "td", "a"]);
function inertProblems(html: string): string[] {
  const problems: string[] = [];
  for (const tag of html.match(/<[^>]*>/g) ?? []) {
    const m = tag.match(/^<\/?([a-z0-9]+)((?:\s+[a-z-]+="[^"]*")*)\s*>$/i);
    if (!m) {
      problems.push(`malformed tag ${tag}`);
      continue;
    }
    if (!TAGS.has(m[1]!.toLowerCase())) problems.push(`tag not allowed: ${tag}`);
    for (const attr of m[2]!.matchAll(/\s+([a-z-]+)="([^"]*)"/gi)) {
      const [, name, value] = attr;
      if (name === "style") {
        if (/url\(|@import|expression\(|javascript:/i.test(value!)) problems.push(`style loads something: ${tag}`);
      } else if (name === "href" && m[1]!.toLowerCase() === "a") {
        if (!/^https?:\/\//i.test(value!)) problems.push(`href not http(s): ${tag}`);
      } else problems.push(`attribute not allowed: ${name} in ${tag}`);
    }
  }
  return problems;
}

describe("HTML export", () => {
  it("is self-contained, inline-styled and carries the whole review", () => {
    const html = revealToHtml(demo());
    expect(inertProblems(html)).toEqual([]);
    expect(html).toContain('style="');
    for (const heading of ["What We Heard", "What&#39;s Getting in the Way", "The Numbers You Mentioned", "What This Could Be Worth", "Your Current Tools", "Next Steps"]) {
      expect(html, heading).toContain(heading);
    }
    expect(html).toContain("Brightline Marketing");
    expect(html).toContain("$14,400 a year");
    expect(html).toContain("an assumption, not a figure you stated");
    expect(html).toContain('href="https://cal.example/avery"');
  });

  it("escapes hostile text in every place client or consultant text appears", () => {
    const evil = `<img src=x onerror=alert(1)>"'&`;
    const d = revealSchema.parse({
      ...demo(),
      summary: evil,
      painPoints: [{ title: evil, detail: evil }],
      currentState: [evil],
      futureState: [evil],
      moneyMentioned: [{ amount: 5, period: "month", context: evil }],
      techStack: [{ tool: evil, purpose: evil, monthlyCost: null, annualCost: null, note: evil }],
      totals: { monthly: 0, annual: 0, toolsWithCost: 0, toolsTotal: 1 },
      nextSteps: [evil],
      roi: null,
      timeline: { deadline: evil, window: evil },
      header: { ...demo().header, businessName: evil, tagline: evil, clientName: evil, clientCompany: evil, consultantName: evil },
    });
    const html = revealToHtml(d);
    expect(inertProblems(html)).toEqual([]);
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    // The plain-text export is for a text field, so it keeps the characters as typed.
    expect(revealToText(d)).toContain(evil);
  });

  it("cannot be broken out of the booking link's href attribute", () => {
    const url = 'https://x.example/?a="onmouseover="alert(1)';
    const d = revealSchema.parse({ ...demo(), booking: { url, label: 'Book "now"' } });
    const html = revealToHtml(d);
    expect(html).not.toContain('"onmouseover=');
    expect(html).toContain("&quot;onmouseover=&quot;");
    expect(inertProblems(html)).toEqual([]);
  });

  it("esc() covers the five characters that matter", () => {
    expect(esc(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });
});

describe("plain-text export", () => {
  it("reads as the review, in order, with the estimate labelled", () => {
    const t = revealToText(demo());
    const order = ["WHAT WE HEARD", "WHAT'S GETTING IN THE WAY", "THE NUMBERS YOU MENTIONED", "WHAT THIS COULD BE WORTH", "YOUR CURRENT TOOLS", "NEXT STEPS"].map((h) => t.indexOf(h));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(t).toContain("Could be recovered (estimate): 240 hours a year");
    expect(t).toContain("Book a call with Avery Quinn: https://cal.example/avery");
  });
});

describe("follow-up email", () => {
  it("is addressed by first name, signed, and short enough for a mailto link", () => {
    const content = buildEmailContent(demo());
    const href = mailtoHref({ to: "priya@brightline.example", ...content });
    expect(href.startsWith("mailto:priya@brightline.example?subject=Discovery%20Review%20for%20Brightline%20Marketing&body=")).toBe(true);
    const body = decodeURIComponent(href.split("&body=")[1]!);
    expect(body.startsWith("Hi Priya,")).toBe(true);
    expect(body.endsWith("Avery Quinn\nQuinn Studio")).toBe(true);
    expect(body).toContain("Book a call with Avery Quinn: https://cal.example/avery");
    expect(body).not.toMatch(/attach/i);
    expect(href.length).toBeLessThanOrEqual(MAILTO_MAX);
  });

  it("drops optional paragraphs, never the next steps or signature, when too long", () => {
    const long: EmailMessage = {
      to: null,
      subject: "S",
      parts: [
        { text: "Hi," },
        { text: "x".repeat(1200), droppable: true },
        { text: "y".repeat(1200), droppable: true },
        { text: "NEXT-STEPS" },
        { text: "SIGNATURE" },
      ],
    };
    const body = decodeURIComponent(mailtoHref(long).split("&body=")[1]!);
    expect(body).toContain("NEXT-STEPS");
    expect(body).toContain("SIGNATURE");
    expect(body).toContain("x".repeat(1200)); // the earlier optional paragraph survives...
    expect(body).not.toContain("y".repeat(1200)); // ...the last one is dropped first
    expect(mailtoHref(long).length).toBeLessThanOrEqual(MAILTO_MAX);
  });

  it.each([
    ["a header-injection attempt", "a@b.co?bcc=evil@x.com"],
    ["a second recipient", "a@b.co,c@d.co"],
    ["a newline", "a@b.co\nbcc: evil@x.com"],
    ["not an address", "not an address"],
  ])("leaves out a recipient that is %s", (_n, to) => {
    const href = mailtoHref({ to, subject: "S", parts: [{ text: "B" }] });
    expect(href.startsWith("mailto:?subject=S")).toBe(true);
    expect(href).not.toMatch(/bcc/i);
  });

  it("cannot be turned into extra headers through the subject", () => {
    const href = mailtoHref({ to: null, subject: "Hi\r\nBcc: evil@x.com", parts: [{ text: "B" }] });
    expect(href).not.toContain("%0A");
    expect(href).not.toContain("%0D");
  });

  it("goes out through the provider interface (mailto today)", async () => {
    expect(mailtoProvider.id).toBe("mailto");
    const result = await mailtoProvider.deliver({ to: "a@b.co", subject: "S", parts: [{ text: "B" }] });
    expect(result).toEqual({ kind: "compose", href: "mailto:a@b.co?subject=S&body=B" });
  });
});

describe("the share kit built from a real session", () => {
  let sessionId: string;
  let coachStrings: string[];

  beforeAll(async () => {
    const s = await makeDemoSession("share");
    sessionId = s.id;
    await prisma.client.update({ where: { id: s.clientId }, data: { email: "pat@acme.example" } });
    await prisma.consultant.update({ where: { id: s.consultantId }, data: { calendarLink: "https://cal.example/test" } });
    await buildClientReview(sessionId);
    const stored = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    const coaching = stored.coaching as { readiness: { reason: string }; reflectBack: string; nextQuestion: { text: string } };
    await prisma.session.update({
      where: { id: sessionId },
      data: { internalNotes: SENTINEL_NOTES, coaching: { ...coaching, planted: SENTINEL_COACH } },
    });
    await prisma.question.updateMany({ where: { sessionId, topic: "time_sinks" }, data: { notes: SENTINEL_QNOTE } });
    coachStrings = [SENTINEL_NOTES, SENTINEL_COACH, SENTINEL_QNOTE, coaching.readiness.reason, coaching.reflectBack, coaching.nextQuestion.text];
  });

  it("is addressed to the client's email and carries the review", async () => {
    const kit = await getShareKit(sessionId);
    expect(kit.to).toBe("pat@acme.example");
    expect(kit.text).toContain("WHAT WE HEARD");
    expect(kit.html).toContain("Acme Heating");
  });

  it("contains none of the private values or vocabulary, in any format", async () => {
    const kit = await getShareKit(sessionId);
    for (const [name, content] of Object.entries({ html: kit.html, text: kit.text, email: JSON.stringify(kit.email) })) {
      expect(findLeaks(content, coachStrings), `${name} leaked a private value`).toEqual([]);
      expect(findLeaks(content, FORBIDDEN_TEXT), `${name} used private vocabulary`).toEqual([]);
    }
  });

  it("negative control: the scan can fail", () => {
    expect(findLeaks(`<p>${SENTINEL_NOTES}</p>`, coachStrings)).toEqual([SENTINEL_NOTES]);
  });

  it("the export code never references private session data (static check)", () => {
    const root = path.resolve(__dirname, "..");
    const banned = /internalNotes|decisionReadiness|coaching|prisma\.extraction|prisma\.question|server\/review|mock-ai/i;
    for (const f of ["src/server/share.ts", "src/lib/reveal/export.ts", "src/lib/email.ts", "src/components/cockpit/share-dialog.tsx", "src/app/api/sessions/[id]/share/route.ts"]) {
      expect(banned.test(fs.readFileSync(path.join(root, f), "utf8")), `${f} references private data`).toBe(false);
    }
  });

  describe("GET /api/sessions/[id]/share", () => {
    const call = (id: string) => shareRoute(new Request("http://test.local/api"), { params: Promise.resolve({ id }) });

    it("returns the kit", async () => {
      const res = await call(sessionId);
      expect(res.status).toBe(200);
      const kit = (await res.json()) as { capabilities: { smtp: boolean }; lastSent: unknown };
      expect(Object.keys(kit).sort()).toEqual(["capabilities", "email", "html", "lastSent", "text", "to"]);
      expect(kit.capabilities.smtp).toBe(false); // nothing configured: the app offers mailto drafts only
      expect(kit.lastSent).toBeNull();
    });
    it("404s for an unknown session", async () => {
      expect((await call("nope")).status).toBe(404);
    });
    it("404s, with a plain message, before a review is built", async () => {
      const fresh = await makeDemoSession("share-unbuilt");
      const res = await call(fresh.id);
      expect(res.status).toBe(404);
      expect(((await res.json()) as { error: string }).error).toMatch(/Build the client review/);
    });
    it("fails closed with 409 when the stored review no longer passes its safety check", async () => {
      const bad = await makeDemoSession("share-tampered");
      await buildClientReview(bad.id);
      const row = await prisma.report.findUniqueOrThrow({ where: { sessionId: bad.id } });
      await prisma.report.update({ where: { sessionId: bad.id }, data: { revealData: { ...(row.revealData as object), coaching: "leak" } } });
      const res = await call(bad.id);
      expect(res.status).toBe(409);
      expect(JSON.stringify(await res.json())).not.toContain("leak");
    });
  });
});
