import { describe, expect, it } from "vitest";
import { parseTranscript } from "@/lib/transcript";

describe("parseTranscript", () => {
  it("reads Consultant:/Client: labels", () => {
    expect(parseTranscript("Consultant: Hi there.\nClient: Hello!\nConsultant: How's business?")).toEqual([
      { speaker: "CONSULTANT", text: "Hi there." },
      { speaker: "CLIENT", text: "Hello!" },
      { speaker: "CONSULTANT", text: "How's business?" },
    ]);
  });

  it("treats the first unknown label as the consultant and the next as the client", () => {
    const out = parseTranscript("Avery: Tell me more.\nMarcus: We do HVAC.\nAvery: Great.");
    expect(out.map((s) => s.speaker)).toEqual(["CONSULTANT", "CLIENT", "CONSULTANT"]);
  });

  it("joins unlabeled continuation lines onto the previous segment", () => {
    const out = parseTranscript("Client: First line\nsecond line\nConsultant: Ok");
    expect(out[0]?.text).toBe("First line second line");
    expect(out).toHaveLength(2);
  });

  it("alternates speakers when nothing is labeled", () => {
    const out = parseTranscript("How are you?\n\nBusy.\n\nWhy?");
    expect(out.map((s) => s.speaker)).toEqual(["CONSULTANT", "CLIENT", "CONSULTANT"]);
  });

  it("drops empty segments and handles CRLF", () => {
    expect(parseTranscript("Client:\r\nConsultant: Hi\r\n")).toEqual([{ speaker: "CONSULTANT", text: "Hi" }]);
    expect(parseTranscript("   \n\n  ")).toEqual([]);
  });

  it("does not mistake a time or URL inside a sentence for a speaker label", () => {
    const out = parseTranscript("Client: We meet at 10:30 every day.");
    expect(out).toEqual([{ speaker: "CLIENT", text: "We meet at 10:30 every day." }]);
  });
});
