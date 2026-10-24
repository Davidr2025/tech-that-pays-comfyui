/** Pre-call setup and the transcript sources, through the real route handlers and database. */
import { beforeAll, describe, expect, it } from "vitest";
import { POST as brandRoute } from "@/app/api/clients/[id]/brand/route";
import { PUT as updateClientRoute } from "@/app/api/clients/[id]/route";
import { POST as createClientRoute } from "@/app/api/clients/route";
import { PUT as consultantRoute } from "@/app/api/consultant/route";
import { PATCH as sessionPatch } from "@/app/api/sessions/[id]/route";
import { POST as reviewRoute } from "@/app/api/sessions/[id]/review/route";
import { POST as statusRoute } from "@/app/api/sessions/[id]/status/route";
import { POST as transcriptRoute } from "@/app/api/sessions/[id]/transcript/route";
import { POST as createSessionRoute } from "@/app/api/sessions/route";
import { prisma } from "@/lib/db";
import { getRevealPayload } from "@/server/reveal";
import { getConsultant } from "@/server/consultant";

const json = (body: unknown, method = "POST") => new Request("http://test.local/api", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
const read = async (res: Response) => (await res.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const validConsultant = { name: "Avery Quinn", email: "avery@quinn-ops.example", businessName: "Quinn Operations Studio", tagline: "Practical systems", primaryColor: "#0F766E", accentColor: "#d97706", calendarLink: "calendly.com/avery/30min", logoUrl: null };
const validClient = { name: "Priya Nair", companyName: "Brightline Marketing", industry: "Marketing", websiteUrl: "brightline.example", calendarLink: "", brandColors: null };

let ownerId: string;
beforeAll(async () => {
  const existing = await getConsultant();
  ownerId = existing
    ? existing.id
    : (await prisma.consultant.create({ data: { name: "Owner", email: "owner@example.test", businessName: "Owner Co" } })).id;
});

async function newClient(extra: Record<string, unknown> = {}) {
  const res = await createClientRoute(json({ ...validClient, ...extra }));
  expect(res.status).toBe(201);
  return (await read(res)).id as string;
}
async function newSession(clientId: string, extra: Record<string, unknown> = {}) {
  const res = await createSessionRoute(json({ clientId, ...extra }));
  expect(res.status).toBe(201);
  return (await read(res)).id as string;
}

describe("consultant settings", () => {
  it("saves a valid profile, lower-casing colours and completing the booking link", async () => {
    expect((await consultantRoute(json(validConsultant, "PUT"))).status).toBe(200);
    const c = await prisma.consultant.findUniqueOrThrow({ where: { id: ownerId } });
    expect(c).toMatchObject({ primaryColor: "#0f766e", calendarLink: "https://calendly.com/avery/30min", tagline: "Practical systems" });
  });

  it("stores a logo and clears it again", async () => {
    await consultantRoute(json({ ...validConsultant, logoUrl: PNG }, "PUT"));
    expect((await prisma.consultant.findUniqueOrThrow({ where: { id: ownerId } })).logoUrl).toBe(PNG);
    await consultantRoute(json({ ...validConsultant, logoUrl: null }, "PUT"));
    expect((await prisma.consultant.findUniqueOrThrow({ where: { id: ownerId } })).logoUrl).toBeNull();
  });

  it.each([
    ["a bad colour", { primaryColor: "teal" }],
    ["a bad accent", { accentColor: "#12" }],
    ["a script URL as the logo", { logoUrl: "javascript:alert(1)" }],
    ["a remote image as the logo", { logoUrl: "https://evil.example/x.png" }],
    ["an HTML data URL as the logo", { logoUrl: "data:text/html;base64,PHNjcmlwdD4=" }],
    ["a javascript: booking link", { calendarLink: "javascript:alert(1)" }],
    ["a missing name", { name: "  " }],
    ["a bad email", { email: "nope" }],
  ])("rejects %s", async (_label, patch) => {
    const res = await consultantRoute(json({ ...validConsultant, ...patch }, "PUT"));
    expect(res.status).toBe(400);
    expect(typeof (await read(res)).error).toBe("string");
  });
});

describe("clients", () => {
  it("creates and updates a client, saving brand colours and normalising the website", async () => {
    const id = await newClient();
    const c = await prisma.client.findUniqueOrThrow({ where: { id } });
    expect(c).toMatchObject({ consultantId: ownerId, websiteUrl: "https://brightline.example/", calendarLink: null });

    const brand = { primary: "#2563EB", accent: "#e11d48", source: "manual", detected: [] };
    expect((await updateClientRoute(json({ ...validClient, brandColors: brand }, "PUT"), ctx({ id }))).status).toBe(200);
    expect((await prisma.client.findUniqueOrThrow({ where: { id } })).brandColors).toEqual({ ...brand, primary: "#2563eb" });
  });

  it("validates input", async () => {
    expect((await createClientRoute(json({ ...validClient, name: "" }))).status).toBe(400);
    expect((await createClientRoute(json({ ...validClient, websiteUrl: "ftp://x.example" }))).status).toBe(400);
    expect((await createClientRoute(json({ ...validClient, brandColors: { primary: "blue", accent: null, source: "manual", detected: [] } }))).status).toBe(400);
    expect((await createClientRoute(json({ ...validClient, brandColors: { primary: "#2563eb", accent: null, source: "manual", detected: [], extra: 1 } }))).status).toBe(400);
  });

  it("will not edit another consultant's client", async () => {
    const other = await prisma.consultant.create({ data: { name: "Other", email: "other@example.test", businessName: "Other Co" } });
    const theirs = await prisma.client.create({ data: { consultantId: other.id, name: "X", companyName: "Theirs" } });
    expect((await updateClientRoute(json(validClient, "PUT"), ctx({ id: theirs.id }))).status).toBe(404);
    expect((await brandRoute(new Request("http://t", { method: "POST" }), ctx({ id: theirs.id }))).status).toBe(404);
    expect((await prisma.client.findUniqueOrThrow({ where: { id: theirs.id } })).companyName).toBe("Theirs");
  });
});

describe("brand detection endpoint", () => {
  const detect = (id: string) => brandRoute(new Request("http://t", { method: "POST" }), ctx({ id }));

  it("asks for a website first", async () => {
    const id = await newClient({ websiteUrl: "" });
    const res = await detect(id);
    expect(res.status).toBe(400);
    expect((await read(res)).error).toMatch(/website/i);
  });

  it.each(["http://127.0.0.1/", "http://localhost/", "http://169.254.169.254/latest/meta-data/", "http://[::1]/", "http://10.0.0.5/"])("refuses to look at internal address %s", async (site) => {
    const id = await newClient({ websiteUrl: site });
    const res = await detect(id);
    expect(res.status).toBe(400);
    expect((await read(res)).error).toMatch(/private or internal/);
  });
});

describe("creating a session", () => {
  it("starts in SETUP with the 12-question bank and the chosen branding", async () => {
    const clientId = await newClient({ brandColors: { primary: "#2563eb", accent: null, source: "manual", detected: [] } });
    const id = await newSession(clientId, { brandingMode: "CLIENT" });
    const s = await prisma.session.findUniqueOrThrow({ where: { id } });
    expect(s).toMatchObject({ status: "SETUP", type: "DISCOVERY", brandingMode: "CLIENT", consultantId: ownerId });
    expect(s.title).toBe("Discovery call — Brightline Marketing");
    expect(await prisma.question.count({ where: { sessionId: id } })).toBe(12);
  });

  it("refuses assessment types until they have question banks", async () => {
    const clientId = await newClient();
    for (const type of ["OPERATIONAL_ASSESSMENT", "TECHNOLOGY_ASSESSMENT", "COMBINED_ASSESSMENT"]) {
      const res = await createSessionRoute(json({ clientId, type }));
      expect(res.status).toBe(400);
      expect((await read(res)).error).toMatch(/assessment mode/);
    }
    expect((await createSessionRoute(json({ clientId, type: "NOT_A_TYPE" }))).status).toBe(400);
  });

  it("refuses client branding when the client has no brand colours, and unknown or foreign clients", async () => {
    const clientId = await newClient();
    expect((await createSessionRoute(json({ clientId, brandingMode: "CLIENT" }))).status).toBe(400);
    expect((await createSessionRoute(json({ clientId: "missing" }))).status).toBe(404);
    const other = await prisma.consultant.create({ data: { name: "O2", email: "o2@example.test", businessName: "O2" } });
    const theirs = await prisma.client.create({ data: { consultantId: other.id, name: "X", companyName: "Theirs" } });
    expect((await createSessionRoute(json({ clientId: theirs.id }))).status).toBe(404);
  });

  it("switches branding mode with the same rule", async () => {
    const plain = await newSession(await newClient());
    expect((await sessionPatch(json({ brandingMode: "CLIENT" }, "PATCH"), ctx({ id: plain }))).status).toBe(400);
    const branded = await newSession(await newClient({ brandColors: { primary: "#2563eb", accent: null, source: "manual", detected: [] } }));
    expect((await sessionPatch(json({ brandingMode: "CLIENT" }, "PATCH"), ctx({ id: branded }))).status).toBe(200);
    expect((await prisma.session.findUniqueOrThrow({ where: { id: branded } })).brandingMode).toBe("CLIENT");
    expect((await sessionPatch(json({ brandingMode: "CLIENT" }, "PATCH"), ctx({ id: "missing" }))).status).toBe(404);
  });
});

describe("transcript sources", () => {
  const post = (id: string, body: unknown) => transcriptRoute(json(body), ctx({ id }));

  it("PASTE: loads labeled text and moves the session to LIVE", async () => {
    const id = await newSession(await newClient());
    const res = await post(id, { mode: "paste", text: "Consultant: Hi.\nClient: Hello." });
    expect(res.status).toBe(200);
    const body = await read(res);
    expect(body.segments.map((s: { speaker: string }) => s.speaker)).toEqual(["CONSULTANT", "CLIENT"]);
    const s = await prisma.session.findUniqueOrThrow({ where: { id } });
    expect(s.status).toBe("LIVE");
    expect(s.startedAt).not.toBeNull();
  });

  it("UPLOAD: reads a Zoom-style VTT, keeps timestamps, and honours who 'you' are", async () => {
    const id = await newSession(await newClient());
    const vtt = "WEBVTT\n\n00:00:05.000 --> 00:00:08.000\nAvery Quinn: Thanks for joining.\n\n00:00:09.000 --> 00:00:12.000\nPriya Nair: Happy to be here.\n\n00:01:10.000 --> 00:01:12.000\nAvery Quinn: Tell me more.\n";
    const res = await post(id, { mode: "upload", fileName: "zoom.vtt", text: vtt, you: "Priya Nair" });
    const body = await read(res);
    expect(body.format).toBe("vtt");
    expect(body.speakers).toEqual(["Avery Quinn", "Priya Nair"]);
    expect(body.segments.map((s: { speaker: string; startSec: number }) => [s.speaker, s.startSec])).toEqual([["CLIENT", 5], ["CONSULTANT", 9], ["CLIENT", 70]]);
    const stored = await prisma.transcriptSegment.findMany({ where: { sessionId: id }, orderBy: { order: "asc" } });
    expect(stored.map((s) => s.startSec)).toEqual([5, 9, 70]);
  });

  it("UPLOAD: unlabeled captions alternate, say so, and can be swapped", async () => {
    const id = await newSession(await newClient());
    const vtt = "WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nThanks for joining\n\n00:00:12.000 --> 00:00:14.000\nSure, happy to";
    const plain = await read(await post(id, { mode: "upload", text: vtt }));
    expect(plain.unattributed).toBe(true);
    expect(plain.segments.map((s: { speaker: string }) => s.speaker)).toEqual(["CONSULTANT", "CLIENT"]);
    const swapped = await read(await post(id, { mode: "upload", text: vtt, swap: true }));
    expect(swapped.segments.map((s: { speaker: string }) => s.speaker)).toEqual(["CLIENT", "CONSULTANT"]);
  });

  it("MANUAL: appends typed lines in order, with timestamps, and goes LIVE", async () => {
    const id = await newSession(await newClient());
    const a = await read(await post(id, { mode: "append", speaker: "CLIENT", text: "We lose leads.", startSec: 4 }));
    const b = await read(await post(id, { mode: "append", speaker: "CONSULTANT", text: "How many?", startSec: 9 }));
    expect([a.segment.order, b.segment.order]).toEqual([0, 1]);
    expect(b.segment).toMatchObject({ speaker: "CONSULTANT", text: "How many?", startSec: 9 });
    expect((await prisma.session.findUniqueOrThrow({ where: { id } })).status).toBe("LIVE");
    // Appending after a pasted transcript continues it.
    await post(id, { mode: "paste", text: "Client: one\nConsultant: two" });
    const c = await read(await post(id, { mode: "append", speaker: "CLIENT", text: "three" }));
    expect(c.segment.order).toBe(2);
  });

  it("MANUAL: rejects empty and oversized lines", async () => {
    const id = await newSession(await newClient());
    expect((await post(id, { mode: "append", speaker: "CLIENT", text: "   " })).status).toBe(400);
    expect((await post(id, { mode: "append", speaker: "CLIENT", text: "x".repeat(4001) })).status).toBe(400);
    expect((await post(id, { mode: "append", speaker: "NOBODY", text: "hi" })).status).toBe(400);
    expect(await prisma.transcriptSegment.count({ where: { sessionId: id } })).toBe(0);
  });

  it("rejects empty text and unknown sessions", async () => {
    const id = await newSession(await newClient());
    expect((await post(id, { mode: "upload", text: "   \n\n " })).status).toBe(400);
    expect((await post("missing", { mode: "paste", text: "Client: hi" })).status).toBe(404);
  });
});

describe("session lifecycle", () => {
  const status = (id: string, to: string) => statusRoute(json({ to }), ctx({ id }));
  const build = (id: string) => reviewRoute(json({}), ctx({ id }));
  const current = async (id: string) => (await prisma.session.findUniqueOrThrow({ where: { id } })).status;

  it("walks SETUP -> LIVE -> REVIEW -> REVEALED -> COMPLETED", async () => {
    const id = await newSession(await newClient());
    expect(await current(id)).toBe("SETUP");
    await transcriptRoute(json({ mode: "demo" }), ctx({ id }));
    expect(await current(id)).toBe("LIVE");
    expect((await build(id)).status).toBe(200);
    expect(await current(id)).toBe("REVIEW");
    expect((await status(id, "REVEALED")).status).toBe(200);
    expect(await current(id)).toBe("REVEALED");
    expect((await status(id, "COMPLETED")).status).toBe(200);
    const done = await prisma.session.findUniqueOrThrow({ where: { id } });
    expect(done.status).toBe("COMPLETED");
    expect(done.endedAt).not.toBeNull();
  });

  it("will not reveal before a review exists, nor skip ahead", async () => {
    const id = await newSession(await newClient());
    expect((await status(id, "REVEALED")).status).toBe(409);
    expect((await status(id, "COMPLETED")).status).toBe(409);
    await transcriptRoute(json({ mode: "demo" }), ctx({ id }));
    const res = await status(id, "REVEALED");
    expect(res.status).toBe(409);
    expect((await read(res)).error).toMatch(/Build the client review/);
    expect((await status(id, "LIVE")).status).toBe(400); // not a hand-set status
  });

  it("a new transcript after the review sends the session back to LIVE and drops the review", async () => {
    const id = await newSession(await newClient());
    await transcriptRoute(json({ mode: "demo" }), ctx({ id }));
    await build(id);
    await status(id, "REVEALED");
    await transcriptRoute(json({ mode: "paste", text: "Consultant: a\nClient: b" }), ctx({ id }));
    expect(await current(id)).toBe("LIVE");
    expect(await getRevealPayload(id)).toBeNull();
  });

  it("rebuilding a revealed review needs revealing again", async () => {
    const id = await newSession(await newClient());
    await transcriptRoute(json({ mode: "demo" }), ctx({ id }));
    await build(id);
    await status(id, "REVEALED");
    await build(id);
    expect(await current(id)).toBe("REVIEW");
  });

  it("a COMPLETED session is final: no new transcript, typed line, or review", async () => {
    const id = await newSession(await newClient());
    await transcriptRoute(json({ mode: "demo" }), ctx({ id }));
    await build(id);
    await status(id, "COMPLETED");
    for (const body of [{ mode: "demo" }, { mode: "paste", text: "Client: x" }, { mode: "append", speaker: "CLIENT", text: "x" }]) {
      const res = await transcriptRoute(json(body), ctx({ id }));
      expect(res.status, JSON.stringify(body)).toBe(409);
      expect((await read(res)).error).toMatch(/session is complete/);
    }
    expect((await build(id)).status).toBe(409);
    expect(await prisma.transcriptSegment.count({ where: { sessionId: id } })).toBe(20);
  });
});

describe("branding on the client review", () => {
  it("wears the consultant's colours and logo by default", async () => {
    await consultantRoute(json({ ...validConsultant, logoUrl: PNG, primaryColor: "#0f766e", accentColor: "#d97706" }, "PUT"));
    const id = await newSession(await newClient({ brandColors: { primary: "#2563eb", accent: "#e11d48", source: "manual", detected: [] } }));
    await transcriptRoute(json({ mode: "demo" }), ctx({ id }));
    await reviewRoute(json({}), ctx({ id }));
    const header = (await getRevealPayload(id))!.header;
    expect(header).toMatchObject({ brandColor: "#0f766e", accentColor: "#d97706", logoUrl: PNG, businessName: "Quinn Operations Studio" });
  });

  it("wears the client's colours (and no consultant logo) when the session says so", async () => {
    const id = await newSession(await newClient({ brandColors: { primary: "#2563eb", accent: "#e11d48", source: "manual", detected: [] } }), { brandingMode: "CLIENT" });
    await transcriptRoute(json({ mode: "demo" }), ctx({ id }));
    await reviewRoute(json({}), ctx({ id }));
    const header = (await getRevealPayload(id))!.header;
    expect(header).toMatchObject({ brandColor: "#2563eb", accentColor: "#e11d48", logoUrl: null });
    expect(header.businessName).toBe("Quinn Operations Studio"); // still prepared by the consultant
  });

  it("falls back to the consultant's accent when the client has only one colour", async () => {
    const id = await newSession(await newClient({ brandColors: { primary: "#2563eb", accent: null, source: "website", detected: ["#2563eb"] } }), { brandingMode: "CLIENT" });
    await transcriptRoute(json({ mode: "demo" }), ctx({ id }));
    await reviewRoute(json({}), ctx({ id }));
    expect((await getRevealPayload(id))!.header).toMatchObject({ brandColor: "#2563eb", accentColor: "#d97706" });
  });
});
