/** Assessment sessions end to end, through the real route handlers and database. */
import { beforeAll, describe, expect, it } from "vitest";
import { POST as reviewRoute } from "@/app/api/sessions/[id]/review/route";
import { POST as statusRoute } from "@/app/api/sessions/[id]/status/route";
import { POST as transcriptRoute } from "@/app/api/sessions/[id]/transcript/route";
import { POST as createClientRoute } from "@/app/api/clients/route";
import { POST as createSessionRoute } from "@/app/api/sessions/route";
import { prisma } from "@/lib/db";
import { getPrototype } from "@/server/prototype";
import { getRevealPayload } from "@/server/reveal";
import { currentConsultant as getConsultant } from "@/server/auth";

const json = (body: unknown) => new Request("http://test.local/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const read = async (res: Response) => (await res.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let clientId: string;
beforeAll(async () => {
  if (!(await getConsultant())) await prisma.consultant.create({ data: { name: "Owner", email: "owner-af@example.test", businessName: "Owner Co" } });
  const res = await createClientRoute(json({ name: "Priya Nair", companyName: "Brightline Marketing", industry: "Marketing agency", websiteUrl: "", calendarLink: "", brandColors: null }));
  clientId = (await read(res)).id;
});

const session = async (type: string) => (await read(await createSessionRoute(json({ clientId, type })))).id as string;
const demo = (id: string) => transcriptRoute(json({ mode: "demo" }), ctx(id));
const build = (id: string) => reviewRoute(json({}), ctx(id));

describe("Load Demo Call follows the session type", () => {
  it("loads the discovery call (20 turns) for a discovery session", async () => {
    const id = await session("DISCOVERY");
    expect((await read(await demo(id))).segments).toHaveLength(20);
  });

  it.each(["OPERATIONAL_ASSESSMENT", "TECHNOLOGY_ASSESSMENT", "COMBINED_ASSESSMENT"])("loads the assessment call (54 turns) for %s", async (type) => {
    const id = await session(type);
    const segments = (await read(await demo(id))).segments;
    expect(segments).toHaveLength(54);
    expect(segments[0].text).toMatch(/assessment we scoped/);
  });
});

describe("Build Client Review on an assessment", () => {
  it("builds the review AND the prototype, and tells the cockpit where it is", async () => {
    const id = await session("COMBINED_ASSESSMENT");
    await demo(id);
    const res = await build(id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revealPath: `/reveal/${id}`, prototypePath: `/prototype/${id}` });

    const rows = await prisma.prototypeModule.findMany({ where: { sessionId: id }, orderBy: { order: "asc" } });
    expect(rows.map((r) => [r.order, r.moduleType, r.title])).toEqual([
      [0, "nurture", "Client Nurture"],
      [1, "content", "Content Studio"],
      [2, "finance", "Financial Pulse"],
      [3, "security", "Security & Governance"],
    ]);
    const proto = await getPrototype(id);
    expect(proto?.header.clientCompany).toBe("Brightline Marketing");
    expect(proto?.tools).toContain("HubSpot");
  });

  it("titles the reveal as an assessment and says 'assessment', not 'discovery conversation'", async () => {
    const id = await session("OPERATIONAL_ASSESSMENT");
    await demo(id);
    await build(id);
    const reveal = await getRevealPayload(id);
    expect(reveal?.kind).toBe("OPERATIONAL_ASSESSMENT");
    expect(reveal?.summary).toContain("During our assessment");
    const d = await session("DISCOVERY");
    await demo(d);
    await build(d);
    expect((await getRevealPayload(d))?.kind).toBe("DISCOVERY");
    expect((await getRevealPayload(d))?.summary).toContain("discovery conversation");
  });

  it("a discovery session builds a review but no prototype", async () => {
    const id = await session("DISCOVERY");
    await demo(id);
    expect((await read(await build(id))).prototypePath).toBeNull();
    expect(await prisma.prototypeModule.count({ where: { sessionId: id } })).toBe(0);
  });

  it("rebuilding replaces the prototype rather than stacking a second one", async () => {
    const id = await session("TECHNOLOGY_ASSESSMENT");
    await demo(id);
    await build(id);
    await build(id);
    expect(await prisma.prototypeModule.count({ where: { sessionId: id } })).toBe(4);
  });

  it("a new transcript discards the review and the prototype built from the old one", async () => {
    const id = await session("COMBINED_ASSESSMENT");
    await demo(id);
    await build(id);
    await transcriptRoute(json({ mode: "paste", text: "Consultant: hi\nClient: hello" }), ctx(id));
    expect(await prisma.prototypeModule.count({ where: { sessionId: id } })).toBe(0);
    expect(await getPrototype(id)).toBeNull();
  });

  it("analyses an assessment against its own bank: operations-only never auto-checks technology questions", async () => {
    const id = await session("OPERATIONAL_ASSESSMENT");
    await demo(id);
    await build(id);
    const qs = await prisma.question.findMany({ where: { sessionId: id } });
    expect(qs).toHaveLength(20);
    expect(qs.every((q) => q.topic.startsWith("ops_"))).toBe(true);
    expect(qs.filter((q) => q.isCovered && q.coveredByAI)).toHaveLength(19);
  });

  it("completes like any session and the prototype stays readable", async () => {
    const id = await session("COMBINED_ASSESSMENT");
    await demo(id);
    await build(id);
    expect((await statusRoute(json({ to: "REVEALED" }), ctx(id))).status).toBe(200);
    expect((await statusRoute(json({ to: "COMPLETED" }), ctx(id))).status).toBe(200);
    expect(await getPrototype(id)).not.toBeNull();
    expect((await build(id)).status).toBe(409);
  });
});
