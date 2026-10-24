/**
 * THE PRIVACY TEST — the product's central promise.
 *
 * Builds a real session in a real (test) SQLite database, plants recognisable private values
 * in every private field, runs "Build Client Review", then proves none of them can be found
 * in the reveal payload or in the HTML the client's page renders. Negative controls prove the
 * detectors themselves can fail, so a green run means something.
 */
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { RevealView } from "@/components/reveal/reveal-view";
import { prisma } from "@/lib/db";
import { revealSchema, type RevealData } from "@/lib/reveal/schema";
import { buildClientReview } from "@/server/review";
import { getRevealPayload } from "@/server/reveal";
import { deepKeys, FORBIDDEN_TEXT, findLeaks, htmlToText, makeDemoSession, occurrences } from "./helpers";

const SENTINEL_NOTES = "SENTINEL-INTERNAL-NOTES-7f3a91";
const SENTINEL_COACHING = "SENTINEL-COACHING-c04e22";
const SENTINEL_QNOTE = "SENTINEL-QUESTION-NOTE-e61b08";
const SENTINEL_READINESS = 8137; // an Int no real score or amount in the demo equals

/** Field names that must never appear as keys anywhere in the reveal payload. */
const FORBIDDEN_KEYS = [
  "coaching",
  "internalNotes",
  "decisionReadiness",
  "readiness",
  "severity",
  "signals",
  "objections",
  "reflectBack",
  "nextQuestion",
  "quote",
  "talk",
];

let sessionId: string;
let payload: RevealData;
/** Text only the coach produces, plus planted sentinels: forbidden everywhere in the reveal. */
let coachStrings: string[];
/**
 * The client's own sentences behind a buying signal or objection. These are the client's
 * words, so they may appear ONLY as the context of a dollar amount they stated — never
 * anywhere else, and never labelled as a signal/objection.
 */
let clientQuotes: string[];

beforeAll(async () => {
  const session = await makeDemoSession("privacy");
  sessionId = session.id;
  await buildClientReview(sessionId);

  // Plant sentinels in every private field, on top of what the build already stored.
  const stored = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
  const coaching = stored.coaching as Record<string, unknown> & {
    readiness: { reason: string };
    reflectBack: string;
    nextQuestion: { text: string; why: string };
    signals: { quote: string }[];
    objections: { quote: string }[];
    facts: { urgency: { quote: string }; decision: { quote: string } };
  };
  await prisma.session.update({
    where: { id: sessionId },
    data: {
      internalNotes: SENTINEL_NOTES,
      decisionReadiness: SENTINEL_READINESS,
      coaching: { ...coaching, planted: SENTINEL_COACHING },
    },
  });

  // The consultant's private note on a question, and a question they added themselves.
  await prisma.question.updateMany({ where: { sessionId, topic: "time_sinks" }, data: { notes: SENTINEL_QNOTE } });

  // Everything the consultant sees privately that the client must not.
  coachStrings = [
    SENTINEL_NOTES,
    SENTINEL_QNOTE,
    SENTINEL_COACHING,
    String(SENTINEL_READINESS),
    coaching.readiness.reason,
    coaching.reflectBack,
    coaching.nextQuestion.text,
    coaching.nextQuestion.why,
  ];
  clientQuotes = [
    ...coaching.signals.map((s) => s.quote),
    ...coaching.objections.map((o) => o.quote),
    coaching.facts.urgency.quote,
    coaching.facts.decision.quote,
  ];

  const loaded = await getRevealPayload(sessionId);
  if (!loaded) throw new Error("expected a report to exist");
  payload = loaded;
});

describe("test preconditions (the test is not vacuous)", () => {
  it("really stored private data on the session", async () => {
    const s = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(s.internalNotes).toBe(SENTINEL_NOTES);
    expect(s.decisionReadiness).toBe(SENTINEL_READINESS);
    expect(JSON.stringify(s.coaching)).toContain(SENTINEL_COACHING);
    expect([...coachStrings, ...clientQuotes].every((p) => p.length > 0)).toBe(true);
    expect(coachStrings.length).toBe(8);
    expect((await prisma.question.findFirstOrThrow({ where: { sessionId, topic: "time_sinks" } })).notes).toBe(SENTINEL_QNOTE);
    expect(clientQuotes.length).toBe(5); // 2 buying signals, 1 objection, the urgency and decision statements
    expect(clientQuotes.some((q) => q.includes("freelancer"))).toBe(true);
    expect(clientQuotes.some((q) => q.includes("mid-November"))).toBe(true);
  });
});

describe("reveal payload contains no private data", () => {
  it("has no forbidden field names at any depth", () => {
    const keys = deepKeys(payload);
    expect(FORBIDDEN_KEYS.filter((k) => keys.has(k))).toEqual([]);
  });

  it("contains none of the private values", () => {
    expect(findLeaks(JSON.stringify(payload), coachStrings)).toEqual([]);
  });

  it("uses a client's signal/objection sentence only as a dollar-amount context", () => {
    const moneyContexts = payload.moneyMentioned.map((m) => m.context);
    for (const quote of clientQuotes) {
      const allowed = moneyContexts.filter((c) => c === quote).length;
      expect(occurrences(JSON.stringify(payload), quote), quote).toBe(allowed);
    }
    // The objection and the sentence that carried the deadline are never surfaced as written.
    const objection = clientQuotes.find((q) => q.includes("freelancer"))!;
    expect(occurrences(JSON.stringify(payload), objection)).toBe(0);
  });

  it("only has the allow-listed top-level fields", () => {
    expect(Object.keys(payload).sort()).toEqual(
      ["booking", "currentState", "futureState", "generatedAt", "header", "kind", "moneyMentioned", "nextSteps", "painPoints", "roi", "summary", "techStack", "timeline", "totals", "version"].sort(),
    );
  });
});

describe("rendered reveal page contains no private data", () => {
  it("renders real content but none of the private values or vocabulary", () => {
    const html = renderToStaticMarkup(<RevealView data={payload} />);
    const text = htmlToText(html);
    expect(text).toContain("What We Heard");
    expect(text).toContain("HubSpot");
    expect(findLeaks(text, coachStrings)).toEqual([]);
    expect(findLeaks(text, FORBIDDEN_TEXT)).toEqual([]);
    const moneyContexts = payload.moneyMentioned.map((m) => m.context);
    for (const quote of clientQuotes) {
      expect(occurrences(text, quote), quote).toBe(moneyContexts.filter((c) => c === quote).length);
    }
  });

  it("would not render a stray private field even if one reached the component", () => {
    const polluted = { ...payload, coaching: { note: SENTINEL_COACHING }, internalNotes: SENTINEL_NOTES, decisionReadiness: SENTINEL_READINESS };
    const html = renderToStaticMarkup(<RevealView data={polluted as unknown as RevealData} />);
    expect(findLeaks(htmlToText(html), [SENTINEL_COACHING, SENTINEL_NOTES, String(SENTINEL_READINESS)])).toEqual([]);
  });
});

describe("the boundary is enforced, not just observed", () => {
  it("the strict schema rejects private fields at the top level and nested", () => {
    const withTop = { ...payload, coaching: { x: 1 } };
    const withDecision = { ...payload, decisionReadiness: 80 };
    const withNotes = { ...payload, internalNotes: "x" };
    const withNested = { ...payload, painPoints: payload.painPoints.map((p) => ({ ...p, severity: "high" })) };
    for (const bad of [withTop, withDecision, withNotes, withNested]) {
      expect(revealSchema.safeParse(bad).success).toBe(false);
    }
    expect(revealSchema.safeParse(payload).success).toBe(true);
  });

  it("the reveal read path refuses a tampered row instead of serving it", async () => {
    const original = await prisma.report.findUniqueOrThrow({ where: { sessionId } });
    await prisma.report.update({
      where: { sessionId },
      data: { revealData: { ...(original.revealData as object), internalNotes: SENTINEL_NOTES } },
    });
    await expect(getRevealPayload(sessionId)).rejects.toThrow();
    await prisma.report.update({ where: { sessionId }, data: { revealData: original.revealData as object } });
    await expect(getRevealPayload(sessionId)).resolves.toMatchObject({ version: 1 });
  });

  it("the leak detectors actually detect leaks (negative control)", () => {
    const leaky = JSON.stringify({ ...payload, coaching: { reason: coachStrings[3] }, note: SENTINEL_NOTES });
    expect(findLeaks(leaky, coachStrings).length).toBeGreaterThanOrEqual(2);
    expect(FORBIDDEN_KEYS.filter((k) => deepKeys(JSON.parse(leaky)).has(k))).toContain("coaching");
    expect(findLeaks("<p>Decision Readiness 77</p>", FORBIDDEN_TEXT)).toContain("decision readiness");

    // A leaked sentence with an apostrophe is escaped as &#x27; in raw HTML. The scan must still
    // see it once the markup is decoded (the urgency statement says "I'd want to move ...").
    const withApostrophe = clientQuotes.find((q) => q.includes("'"))!;
    expect(withApostrophe).toBeTruthy();
    const html = renderToStaticMarkup(<RevealView data={{ ...payload, summary: withApostrophe }} />);
    expect(html).not.toContain(withApostrophe); // raw markup would have hidden the leak...
    expect(occurrences(htmlToText(html), withApostrophe)).toBe(1); // ...decoded text does not
  });

  it("the reveal code path never touches private session data (static check)", () => {
    const root = path.resolve(__dirname, "..");
    const files = [
      "src/server/reveal.ts",
      ...walk(path.join(root, "src/app/reveal")),
      ...walk(path.join(root, "src/components/reveal")),
    ].map((f) => path.relative(root, path.resolve(root, f)));
    expect(files.length).toBeGreaterThanOrEqual(4);
    const banned = /internalNotes|decisionReadiness|coaching|prisma\.session|prisma\.extraction|prisma\.question|server\/review|mock-ai/i;
    for (const f of files) {
      const src = fs.readFileSync(path.join(root, f), "utf8");
      expect(banned.test(src), `${f} references private data`).toBe(false);
    }
  });
});

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}
