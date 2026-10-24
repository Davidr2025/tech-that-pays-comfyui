import { describe, expect, it } from "vitest";
import { guessYouLabel, parseTranscript, parseTranscriptDetailed, toSeconds } from "@/lib/transcript";

const roles = (raw: string, opts = {}) => parseTranscript(raw, opts).map((s) => [s.speaker, s.text]);

describe("labeled text (paste)", () => {
  it("reads Consultant:/Client: labels", () => {
    expect(roles("Consultant: Hi there.\nClient: Hello!\nConsultant: How's business?")).toEqual([
      ["CONSULTANT", "Hi there."],
      ["CLIENT", "Hello!"],
      ["CONSULTANT", "How's business?"],
    ]);
  });

  it("maps Me/Host and Customer/Prospect/Owner role labels, in either order", () => {
    expect(roles("Customer: Can you help?\nMe: Yes.").map((r) => r[0])).toEqual(["CLIENT", "CONSULTANT"]);
    expect(roles("Host: Welcome.\nOwner: Thanks.").map((r) => r[0])).toEqual(["CONSULTANT", "CLIENT"]);
  });

  it("treats the first unknown name as the consultant when nobody says otherwise", () => {
    expect(roles("Avery: Tell me more.\nMarcus: We do HVAC.\nAvery: Great.").map((r) => r[0])).toEqual(["CONSULTANT", "CLIENT", "CONSULTANT"]);
  });

  it("joins unlabeled continuation lines onto the previous turn", () => {
    const out = parseTranscript("Client: First line\nsecond line\nConsultant: Ok");
    expect(out).toHaveLength(2);
    expect(out[0]?.text).toBe("First line second line");
  });

  it("alternates speakers when nothing is labeled (blank-line paragraphs, or lines)", () => {
    expect(roles("How are you?\n\nBusy.\n\nWhy?").map((r) => r[0])).toEqual(["CONSULTANT", "CLIENT", "CONSULTANT"]);
    expect(roles("Q?\nA.\nQ2?").map((r) => r[0])).toEqual(["CONSULTANT", "CLIENT", "CONSULTANT"]);
    expect(parseTranscriptDetailed("How are you?\n\nBusy.").unattributed).toBe(true);
  });

  it("drops empty turns and handles CRLF and a BOM", () => {
    expect(roles("﻿Client:\r\nConsultant: Hi\r\n")).toEqual([["CONSULTANT", "Hi"]]);
    expect(parseTranscript("   \n\n  ")).toEqual([]);
  });

  it("does not mistake a time inside a sentence for a speaker label", () => {
    expect(roles("Client: We meet at 10:30 every day.")).toEqual([["CLIENT", "We meet at 10:30 every day."]]);
    expect(roles("Just a note about 9:15 standup.")).toEqual([["CONSULTANT", "Just a note about 9:15 standup."]]);
  });
});

describe("naming who 'you' are", () => {
  const raw = "Avery Quinn: Thanks for joining.\nPriya Nair: Happy to.\nDana: Hi from ops.\nAvery Quinn: Let's start.";

  it("asks when the labels are real names and none is a role", () => {
    const r = parseTranscriptDetailed(raw);
    expect(r.speakers).toEqual(["Avery Quinn", "Priya Nair", "Dana"]);
    expect(r.needsYou).toBe(true);
  });

  it("makes the chosen speaker the consultant and everyone else the client", () => {
    const r = parseTranscriptDetailed(raw, { youLabel: "priya nair" }); // case-insensitive
    expect(r.needsYou).toBe(false);
    expect(r.segments.map((s) => s.speaker)).toEqual(["CLIENT", "CONSULTANT", "CLIENT", "CLIENT"]);
  });

  it("does not ask when role labels already say who is who", () => {
    expect(parseTranscriptDetailed("Consultant: Hi\nClient: Hello").needsYou).toBe(false);
  });

  it("guesses 'you' from the consultant's name, else the first speaker", () => {
    expect(guessYouLabel(["Priya Nair", "Avery Quinn"], "Avery Quinn")).toBe("Avery Quinn");
    expect(guessYouLabel(["Priya Nair", "Avery"], "Avery Quinn")).toBe("Avery");
    expect(guessYouLabel(["A", "B"], "Zed Zed")).toBe("A");
    expect(guessYouLabel([], "Avery")).toBeNull();
  });
});

describe("WebVTT / SubRip (Zoom, Teams exports)", () => {
  const vtt = `WEBVTT

1
00:00:05.120 --> 00:00:08.880
Avery Quinn: Thanks for joining, Priya.

2
00:00:09.000 --> 00:00:12.400
Priya Nair: Happy to be here.

3
00:00:12.500 --> 00:00:15.000
Priya Nair: We're drowning in reporting.

4
00:01:02.000 --> 00:01:05.000
Avery Quinn: Tell me more.
`;

  it("reads speakers, keeps timestamps, and merges consecutive cues from one speaker", () => {
    const r = parseTranscriptDetailed(vtt, { youLabel: "Avery Quinn" });
    expect(r.format).toBe("vtt");
    expect(r.segments.map((s) => [s.speaker, s.startSec, s.text])).toEqual([
      ["CONSULTANT", 5, "Thanks for joining, Priya."],
      ["CLIENT", 9, "Happy to be here. We're drowning in reporting."],
      ["CONSULTANT", 62, "Tell me more."],
    ]);
    expect(r.needsYou).toBe(false);
  });

  it("asks who you are when VTT speakers are names", () => {
    expect(parseTranscriptDetailed(vtt).needsYou).toBe(true);
  });

  it("reads <v Name> voice tags and strips other cue markup", () => {
    const r = parseTranscriptDetailed(`WEBVTT\n\n00:00:01.000 --> 00:00:03.000\n<v Avery>Hello <c.yellow>there</c></v>\n\n00:00:04.000 --> 00:00:06.000\n<v Priya>Hi!</v>`);
    expect(r.segments.map((s) => [s.label, s.text])).toEqual([["Avery", "Hello there"], ["Priya", "Hi!"]]);
  });

  it("reads SubRip (.srt) with comma milliseconds and hour-long offsets", () => {
    const srt = `1\n01:00:05,000 --> 01:00:07,000\nConsultant: Welcome back.\n\n2\n01:00:08,000 --> 01:00:10,000\nClient: Thanks.`;
    const r = parseTranscriptDetailed(srt);
    expect(r.format).toBe("srt");
    expect(r.segments.map((s) => [s.speaker, s.startSec])).toEqual([["CONSULTANT", 3605], ["CLIENT", 3608]]);
  });

  it("ignores NOTE and STYLE blocks and header metadata", () => {
    const r = parseTranscriptDetailed(`WEBVTT - Weekly call\n\nNOTE this is a comment\n\nSTYLE\n::cue { color: red }\n\n00:00:01.000 --> 00:00:02.000\nClient: Hi`);
    expect(r.segments).toHaveLength(1);
  });

  it("groups unlabeled captions into turns by pause, and says speakers are guesses", () => {
    const r = parseTranscriptDetailed(`WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nThanks for joining\n\n00:00:03.500 --> 00:00:05.000\nlet's get started\n\n00:00:12.000 --> 00:00:14.000\nSure, happy to\n\n00:00:30.000 --> 00:00:32.000\nFirst question`);
    expect(r.unattributed).toBe(true);
    expect(r.segments.map((s) => [s.speaker, s.text])).toEqual([
      ["CONSULTANT", "Thanks for joining let's get started"],
      ["CLIENT", "Sure, happy to"],
      ["CONSULTANT", "First question"],
    ]);
  });
});

describe("timestamped text lines (Zoom/Meet saves)", () => {
  it("reads '[Name] 10:01:23 AM: text' without inventing an offset from a wall-clock time", () => {
    const r = parseTranscriptDetailed("[Avery Quinn] 10:01:23 AM: Thanks for joining.\n[Priya Nair] 10:01:40 AM: Happy to.", { youLabel: "Avery Quinn" });
    expect(r.segments.map((s) => [s.speaker, s.text, s.startSec])).toEqual([["CONSULTANT", "Thanks for joining.", null], ["CLIENT", "Happy to.", null]]);
  });

  it("reads 'Name (00:01:05): text' and '00:01:05 Name: text' as offsets", () => {
    expect(parseTranscript("Avery (00:01:05): Hello\nPriya (00:01:09): Hi").map((s) => s.startSec)).toEqual([65, 69]);
    expect(parseTranscript("[00:02:00] Avery: Hello\n[00:02:04] Priya: Hi").map((s) => [s.label, s.startSec])).toEqual([["Avery", 120], ["Priya", 124]]);
  });

  it("converts offsets", () => {
    expect(toSeconds("00:01:05")).toBe(65);
    expect(toSeconds("01:05")).toBe(65);
    expect(toSeconds("01:00:00.500")).toBe(3600);
    expect(toSeconds("10:01 AM")).toBeNull();
  });
});
