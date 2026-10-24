/**
 * The last line of defence: whatever an edit produces must pass the module's strict schema before it is
 * stored. `applyEdit` is correct today, so this forces it to misbehave and checks nothing gets written.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

const control = { mode: "ok" as "ok" | "unknown-key" | "bad-value" };
vi.mock("@/lib/prototype/edit", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/prototype/edit")>();
  return {
    ...real,
    applyEdit: (type: never, data: Record<string, unknown>, edit: never, newId: () => string) => {
      const out = (real.applyEdit as (...a: unknown[]) => Record<string, unknown>)(type, data, edit, newId);
      if (control.mode === "unknown-key") return { ...out, coaching: "leaked private text" };
      if (control.mode === "bad-value") return { ...out, summary: 42 };
      return out;
    },
  };
});

import { prisma } from "@/lib/db";
import { buildClientReview } from "@/server/review";
import { editPrototype } from "@/server/prototype-edit";
import { makeAssessmentSession } from "./helpers";

let sessionId: string;
let moduleId: string;
beforeAll(async () => {
  sessionId = (await makeAssessmentSession("proto-guard")).id;
  await buildClientReview(sessionId);
  moduleId = (await prisma.prototypeModule.findFirstOrThrow({ where: { sessionId, moduleType: "security" } })).id;
});

const dataNow = async () => JSON.stringify((await prisma.prototypeModule.findUniqueOrThrow({ where: { id: moduleId } })).data);
const addAlert = () => editPrototype(sessionId, { op: "alert.add", moduleId, severity: "low", title: "Guard test", detail: "", tool: null });

describe("the schema is the final word on what gets stored", () => {
  it("normal edits go through", async () => {
    control.mode = "ok";
    await expect(addAlert()).resolves.toBeTruthy();
    expect(await dataNow()).toContain("Guard test");
  });

  it("an edit that produced an undeclared field is refused and nothing is written", async () => {
    const before = await dataNow();
    control.mode = "unknown-key";
    await expect(addAlert()).rejects.toThrow();
    expect(await dataNow()).toBe(before);
    expect(before).not.toContain("leaked private text");
  });

  it("an edit that produced an invalid value is refused and nothing is written", async () => {
    const before = await dataNow();
    control.mode = "bad-value";
    await expect(addAlert()).rejects.toThrow();
    expect(await dataNow()).toBe(before);
  });
});
