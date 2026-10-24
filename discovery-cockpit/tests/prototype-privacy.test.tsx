/**
 * Privacy for the PROTOTYPE dashboard, the second client-facing document. Same method as the
 * reveal's: a real session in a real database, sentinels planted in every private field, then
 * proof that none of it (and none of the client's private quotes) can be found in what the
 * prototype stores, serves or renders. Negative controls prove the detectors can fail.
 */
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import PrototypePage, { metadata as prototypeMetadata } from "@/app/prototype/[sessionId]/page";
import { PrototypeView } from "@/components/prototype/prototype-view";
import { prisma } from "@/lib/db";
import { buildClientReview } from "@/server/review";
import { getPrototype } from "@/server/prototype";
import { deepKeys, FORBIDDEN_TEXT, findLeaks, htmlToText, makeAssessmentSession, makeDemoSession } from "./helpers";

const SENTINEL_NOTES = "SENTINEL-PROTO-NOTES-5b1d77";
const SENTINEL_COACHING = "SENTINEL-PROTO-COACHING-e90c13";
const SENTINEL_READINESS = 6419;

/** `severity` is excluded: alerts legitimately carry one. Everything else private is forbidden. */
const FORBIDDEN_KEYS = ["coaching", "internalNotes", "decisionReadiness", "readiness", "signals", "objections", "reflectBack", "nextQuestion", "quote", "talk", "facts"];
const TEXT_BANNED = FORBIDDEN_TEXT.filter((t) => t !== "severity");

let sessionId: string;
let payload: NonNullable<Awaited<ReturnType<typeof getPrototype>>>;
let coachStrings: string[];
let clientQuotes: string[];

beforeAll(async () => {
  sessionId = (await makeAssessmentSession("proto-privacy")).id;
  await buildClientReview(sessionId);

  const stored = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
  const coaching = stored.coaching as { readiness: { reason: string }; reflectBack: string; nextQuestion: { text: string; why: string } } & Record<string, unknown>;
  await prisma.session.update({
    where: { id: sessionId },
    data: { internalNotes: SENTINEL_NOTES, decisionReadiness: SENTINEL_READINESS, coaching: { ...coaching, planted: SENTINEL_COACHING } },
  });

  coachStrings = [SENTINEL_NOTES, SENTINEL_COACHING, String(SENTINEL_READINESS), coaching.readiness.reason, coaching.reflectBack, coaching.nextQuestion.text, coaching.nextQuestion.why];
  // Every client sentence the engine stored as a private finding: pains, objections, signals, facts.
  const rows = await prisma.extraction.findMany({ where: { sessionId, quote: { not: null } } });
  clientQuotes = [...new Set(rows.map((r) => r.quote!).filter((q) => q.length > 25))];

  const loaded = await getPrototype(sessionId);
  if (!loaded) throw new Error("expected a prototype to exist");
  payload = loaded;
});

describe("preconditions (not vacuous)", () => {
  it("stored private data and real client quotes exist to leak", async () => {
    const s = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(s.internalNotes).toBe(SENTINEL_NOTES);
    expect(s.decisionReadiness).toBe(SENTINEL_READINESS);
    expect(clientQuotes.length).toBeGreaterThan(10);
    expect(clientQuotes.some((q) => /broke during a launch/.test(q))).toBe(true); // the objection
    expect(payload.modules).toHaveLength(4);
  });
});

describe("prototype payload", () => {
  it("has no private field names at any depth", () => {
    const keys = deepKeys(payload);
    expect(FORBIDDEN_KEYS.filter((k) => keys.has(k))).toEqual([]);
  });

  it("contains none of the coaching text, sentinels, or the client's private quotes", () => {
    const json = JSON.stringify(payload);
    expect(findLeaks(json, coachStrings)).toEqual([]);
    expect(findLeaks(json, clientQuotes)).toEqual([]);
  });

  it("is only: kind, the branded header, tool names and the validated modules", () => {
    expect(Object.keys(payload).sort()).toEqual(["header", "kind", "modules", "tools"]);
    expect(payload.header.businessName).toBe("Test Studio");
  });
});

describe("rendered prototype", () => {
  const render = () => htmlToText(renderToStaticMarkup(<PrototypeView payload={payload} />));

  it("shows the real content, labelled PROTOTYPE, with invented rows marked as examples", () => {
    const text = render();
    expect(text).toContain("PROTOTYPE");
    for (const heading of ["Client Nurture", "Content Studio", "Financial Pulse", "Security & Governance", "From scattered to connected"]) expect(text).toContain(heading);
    expect(text).toContain("Acme Marketing");
    expect(text).toContain("HubSpot");
    expect((text.match(/Example/g) ?? []).length).toBeGreaterThan(10);
  });

  it("contains no private vocabulary, coaching text or client quotes", () => {
    const text = render();
    expect(findLeaks(text, TEXT_BANNED)).toEqual([]);
    expect(findLeaks(text, coachStrings)).toEqual([]);
    expect(findLeaks(text, clientQuotes)).toEqual([]);
  });

  it("the whole route (document head and body) is clean too", async () => {
    const html = renderToStaticMarkup(await PrototypePage({ params: Promise.resolve({ sessionId }), searchParams: Promise.resolve({}) }));
    const text = htmlToText(html);
    expect(text).toContain("PROTOTYPE");
    expect(findLeaks(text + JSON.stringify(prototypeMetadata), [...TEXT_BANNED, ...coachStrings, ...clientQuotes, "cockpit"])).toEqual([]);
    expect(prototypeMetadata.robots).toMatchObject({ index: false });
  });
});

describe("the boundary is enforced", () => {
  it("refuses a tampered module instead of serving it, and the page fails closed", async () => {
    const row = await prisma.prototypeModule.findFirstOrThrow({ where: { sessionId, moduleType: "security" } });
    await prisma.prototypeModule.update({ where: { id: row.id }, data: { data: { ...(row.data as object), coaching: { reason: SENTINEL_COACHING } } } });
    await expect(getPrototype(sessionId)).rejects.toThrow();
    const text = htmlToText(renderToStaticMarkup(await PrototypePage({ params: Promise.resolve({ sessionId }), searchParams: Promise.resolve({}) })));
    expect(text).toContain("isn't available");
    expect(text).not.toContain(SENTINEL_COACHING);
    await prisma.prototypeModule.update({ where: { id: row.id }, data: { data: row.data as object } });
    await expect(getPrototype(sessionId)).resolves.toMatchObject({ kind: "COMBINED_ASSESSMENT" });
  });

  it("skips a stored module type nobody renders (the module list is data-driven)", async () => {
    await prisma.prototypeModule.create({ data: { sessionId, moduleType: "weather", title: "Weather", order: 9, data: { anything: SENTINEL_COACHING } } });
    const loaded = await getPrototype(sessionId);
    expect(loaded?.modules).toHaveLength(4);
    expect(JSON.stringify(loaded)).not.toContain(SENTINEL_COACHING);
    await prisma.prototypeModule.deleteMany({ where: { sessionId, moduleType: "weather" } });
  });

  it("serves nothing for a discovery session, or one whose review hasn't been built", async () => {
    const discovery = await makeDemoSession("proto-discovery");
    await buildClientReview(discovery.id);
    expect(await getPrototype(discovery.id)).toBeNull();
    await expect(PrototypePage({ params: Promise.resolve({ sessionId: discovery.id }), searchParams: Promise.resolve({}) })).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK|NEXT_NOT_FOUND/);
    const unbuilt = await makeAssessmentSession("proto-unbuilt");
    expect(await getPrototype(unbuilt.id)).toBeNull();
  });

  it("the leak detectors detect leaks (negative control)", () => {
    const leaky = JSON.stringify({ ...payload, coaching: { reason: coachStrings[3] }, note: clientQuotes[0] });
    expect(findLeaks(leaky, [...coachStrings, ...clientQuotes]).length).toBeGreaterThanOrEqual(2);
    expect(FORBIDDEN_KEYS.filter((k) => deepKeys(JSON.parse(leaky)).has(k))).toContain("coaching");
    const polluted = { ...payload, modules: payload.modules.map((m, i) => (i === 0 ? { ...m, title: clientQuotes[0]! } : m)) };
    expect(findLeaks(htmlToText(renderToStaticMarkup(<PrototypeView payload={polluted} />)), clientQuotes)).toContain(clientQuotes[0]);
  });

  it("the prototype code path never touches private data (static check)", () => {
    const root = path.resolve(__dirname, "..");
    const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
    const files = ["src/server/prototype.ts", "src/server/prototype-edit.ts", "src/lib/prototype/edit.ts", "src/app/api/sessions/[id]/prototype/route.ts", ...walk(path.join(root, "src/app/prototype")), ...walk(path.join(root, "src/components/prototype")), ...walk(path.join(root, "src/components/diagrams"))].map((f) => path.relative(root, path.resolve(root, f)));
    expect(files.length).toBeGreaterThanOrEqual(8);
    const banned = /internalNotes|decisionReadiness|coaching|prisma\.session|prisma\.extraction|prisma\.question|server\/review|mock-ai|prototype\/generate/i;
    for (const f of files) expect(banned.test(fs.readFileSync(path.join(root, f), "utf8")), `${f} references private data`).toBe(false);
  });
});
