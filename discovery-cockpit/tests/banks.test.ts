import { describe, expect, it } from "vitest";
import { ALL_BANKS, bankFor, OPERATIONS_BANK, TECHNOLOGY_BANK } from "@/lib/mock-ai/banks";
import { TOPIC_DETECTORS } from "@/lib/mock-ai/detectors";
import { QUESTION_BANK } from "@/lib/mock-ai/questions";
import { ASSESSMENT_TYPES, isAssessment, SESSION_TYPES, SESSION_TYPE_INFO } from "@/lib/session-types";

describe("question banks", () => {
  it("have the sizes the spec asks for: 12 discovery, 20 operations, 20 technology, 40 combined", () => {
    expect(bankFor("DISCOVERY")).toHaveLength(12);
    expect(bankFor("OPERATIONAL_ASSESSMENT")).toHaveLength(20);
    expect(bankFor("TECHNOLOGY_ASSESSMENT")).toHaveLength(20);
    expect(bankFor("COMBINED_ASSESSMENT")).toHaveLength(40);
  });

  it("a combined assessment is exactly the operations bank then the technology bank", () => {
    expect(bankFor("COMBINED_ASSESSMENT")).toEqual([...OPERATIONS_BANK, ...TECHNOLOGY_BANK]);
  });

  it("never reuse a topic across banks (a session's topics must be unique)", () => {
    const topics = ALL_BANKS.map((q) => q.topic);
    expect(new Set(topics).size).toBe(topics.length);
    expect(OPERATIONS_BANK.every((q) => q.topic.startsWith("ops_"))).toBe(true);
    expect(TECHNOLOGY_BANK.every((q) => q.topic.startsWith("tech_"))).toBe(true);
  });

  it("give every question text, a lever and a coaching hint, and end on an outcome", () => {
    for (const q of ALL_BANKS) {
      expect(q.text.length, q.topic).toBeGreaterThan(20);
      expect(q.text.endsWith("?") || q.text.endsWith("."), q.topic).toBe(true);
      expect(q.why.length, q.topic).toBeGreaterThan(10);
      expect(q.lever, q.topic).toBeTruthy();
    }
    expect(OPERATIONS_BANK.at(-1)?.lever).toBe("outcomes");
    expect(TECHNOLOGY_BANK.at(-1)?.lever).toBe("outcomes");
  });

  it("have a topic detector for every question, so none can silently never auto-check", () => {
    const missing = ALL_BANKS.filter((q) => typeof TOPIC_DETECTORS[q.topic] !== "function").map((q) => q.topic);
    expect(missing).toEqual([]);
    const orphans = Object.keys(TOPIC_DETECTORS).filter((t) => !ALL_BANKS.some((q) => q.topic === t));
    expect(orphans).toEqual([]);
  });

  it("cover the three levers on both assessment banks", () => {
    for (const bank of [OPERATIONS_BANK, TECHNOLOGY_BANK]) {
      const levers = new Set(bank.map((q) => q.lever));
      for (const lever of ["efficiency", "effectiveness", "quality"]) expect(levers.has(lever as never), lever).toBe(true);
    }
    expect(TECHNOLOGY_BANK.some((q) => q.lever === "governance")).toBe(true);
  });

  it("the discovery bank is unchanged", () => {
    expect(bankFor("DISCOVERY")).toBe(QUESTION_BANK);
  });
});

describe("session types", () => {
  it("are all selectable and the three assessments are flagged as assessments", () => {
    expect(SESSION_TYPES.every((t) => SESSION_TYPE_INFO[t].available)).toBe(true);
    expect([...ASSESSMENT_TYPES]).toEqual(["OPERATIONAL_ASSESSMENT", "TECHNOLOGY_ASSESSMENT", "COMBINED_ASSESSMENT"]);
    expect(isAssessment("DISCOVERY")).toBe(false);
    expect(isAssessment("COMBINED_ASSESSMENT")).toBe(true);
  });
});
