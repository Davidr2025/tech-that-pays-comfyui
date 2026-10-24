/** Session-level private notes: route, limits, and that they never reach anything client-facing. */
import { describe, expect, it } from "vitest";
import { PATCH as patchSession } from "@/app/api/sessions/[id]/route";
import { POST as statusRoute } from "@/app/api/sessions/[id]/status/route";
import { prisma } from "@/lib/db";
import { ENCOURAGEMENT, encouragementIndex } from "@/lib/encouragement";
import { buildClientReview } from "@/server/review";
import { getCockpitData } from "@/server/sessions";
import { getShareKit } from "@/server/share";
import { getRevealPayload } from "@/server/reveal";
import { findLeaks, makeDemoSession } from "./helpers";

const send = (body: unknown) => new Request("http://t", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
const stored = async (id: string) => (await prisma.session.findUniqueOrThrow({ where: { id } })).internalNotes;

describe("PATCH /api/sessions/[id] internalNotes", () => {
  it("saves a trimmed note, returns it to the cockpit, and clears on empty", async () => {
    const { id } = await makeDemoSession("callnotes");
    expect((await patchSession(send({ internalNotes: "  Priya trusts numbers.\nFollow up Friday.  " }), ctx({ id }))).status).toBe(200);
    expect(await stored(id)).toBe("Priya trusts numbers.\nFollow up Friday.");
    expect((await getCockpitData(id))!.internalNotes).toBe("Priya trusts numbers.\nFollow up Friday.");
    await patchSession(send({ internalNotes: "   " }), ctx({ id }));
    expect(await stored(id)).toBeNull();
    expect((await getCockpitData(id))!.internalNotes).toBe("");
  });

  it("still sets the branding mode, alone or together with notes", async () => {
    const { id } = await makeDemoSession("callnotes-brand");
    expect((await patchSession(send({ brandingMode: "CONSULTANT", internalNotes: "x y z" }), ctx({ id }))).status).toBe(200);
    expect(await stored(id)).toBe("x y z");
  });

  it.each([
    ["too long", { internalNotes: "x".repeat(10_001) }, 400],
    ["an unknown field", { internalNotes: "ok", status: "COMPLETED" }, 400],
    ["an empty body", {}, 400],
    ["a non-string note", { internalNotes: 7 }, 400],
  ])("rejects %s", async (_n, body, status) => {
    const { id } = await makeDemoSession("callnotes-bad");
    expect((await patchSession(send(body), ctx({ id }))).status).toBe(status);
  });

  it("404s for an unknown session", async () => {
    expect((await patchSession(send({ internalNotes: "hello" }), ctx({ id: "nope" }))).status).toBe(404);
  });

  it("is editable after the session is complete", async () => {
    const s = await makeDemoSession("callnotes-done");
    await buildClientReview(s.id);
    await statusRoute(new Request("http://t", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: "COMPLETED" }) }), ctx({ id: s.id }));
    expect((await patchSession(send({ internalNotes: "Debrief: went well." }), ctx({ id: s.id }))).status).toBe(200);
    expect(await stored(s.id)).toBe("Debrief: went well.");
  });
});

describe("call notes stay private", () => {
  it("appear in neither the reveal nor the share kit", async () => {
    const SENTINEL = "SENTINEL-CALL-NOTE-a41f77";
    const s = await makeDemoSession("callnotes-private");
    await patchSession(send({ internalNotes: SENTINEL }), ctx({ id: s.id }));
    await buildClientReview(s.id);
    const kit = await getShareKit(s.id);
    expect(findLeaks(JSON.stringify(await getRevealPayload(s.id)) + JSON.stringify(kit), [SENTINEL])).toEqual([]);
    expect(await stored(s.id)).toBe(SENTINEL); // and it really was stored
  });
});

describe("encouragement lines", () => {
  it("are a decent set: unique, short, and not borrowed branding", () => {
    expect(ENCOURAGEMENT.length).toBeGreaterThanOrEqual(10);
    expect(new Set(ENCOURAGEMENT).size).toBe(ENCOURAGEMENT.length);
    for (const line of ENCOURAGEMENT) {
      expect(line.length).toBeGreaterThan(10);
      expect(line.length).toBeLessThanOrEqual(120);
      expect(line).not.toMatch(/consultant cockpit/i);
    }
  });

  it("pick a stable line per session and walk through all of them", () => {
    expect(encouragementIndex("demo-session")).toBe(encouragementIndex("demo-session"));
    const seen = new Set(ENCOURAGEMENT.map((_, step) => encouragementIndex("demo-session", step)));
    expect(seen.size).toBe(ENCOURAGEMENT.length);
  });

  it("never appear in anything the client receives", async () => {
    const s = await makeDemoSession("encourage-private");
    await buildClientReview(s.id);
    const everything = JSON.stringify(await getRevealPayload(s.id)) + JSON.stringify(await getShareKit(s.id));
    expect(findLeaks(everything, [...ENCOURAGEMENT])).toEqual([]);
  });
});
