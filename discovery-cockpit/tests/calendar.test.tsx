import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RevealView } from "@/components/reveal/reveal-view";
import { buildInvite, fold, icsText, icsUtc, InviteError, type InviteInput } from "@/lib/ics";
import { DEMO_SEGMENTS } from "@/lib/demo/demo-call";
import { analyze } from "@/lib/mock-ai/engine";
import { buildRevealData } from "@/lib/reveal/build";
import { EMBED_HOSTS, embeddableBooking } from "@/lib/reveal/booking";
import { revealSchema } from "@/lib/reveal/schema";

const base: InviteInput = {
  uid: "session-abc123",
  start: new Date("2026-11-05T14:30:00Z"),
  durationMinutes: 30,
  summary: "Follow-up: Brightline Marketing",
  description: "Walk through the proposed plan.",
  url: "https://calendly.com/avery/30min",
  organizer: { name: "Avery Quinn", email: "avery@quinn-ops.example" },
  attendee: { name: "Priya Nair", email: "priya@brightline.example" },
  now: new Date("2026-10-24T12:00:00Z"),
};

/** A minimal reader: unfold, split into lines, and key by property name (several values allowed). */
function read(ics: string) {
  const unfolded = ics.replace(/\r\n[ \t]/g, "");
  const lines = unfolded.split("\r\n").filter(Boolean);
  const props = new Map<string, string[]>();
  for (const line of lines) {
    const m = line.match(/^([A-Z-]+)((?:;[^:]*?)*|;.*?)?:(.*)$/);
    if (!m) continue;
    props.set(m[1]!, [...(props.get(m[1]!) ?? []), line]);
  }
  return { lines, props, unfolded };
}

describe("invite structure", () => {
  const ics = buildInvite(base);
  const { lines, props } = read(ics);

  it("is a well-formed request: CRLF everywhere, one calendar, one event", () => {
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "").includes("\n")).toBe(false); // no bare line feeds
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines.at(-1)).toBe("END:VCALENDAR");
    expect(lines.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(1);
    expect(lines.filter((l) => l === "END:VEVENT")).toHaveLength(1);
    expect(lines).toContain("VERSION:2.0");
    expect(lines).toContain("METHOD:REQUEST");
  });

  it("invites the guest by email and names the organizer", () => {
    expect(props.get("ATTENDEE")).toEqual(['ATTENDEE;CN="Priya Nair";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:priya@brightline.example']);
    expect(props.get("ORGANIZER")).toEqual(['ORGANIZER;CN="Avery Quinn":mailto:avery@quinn-ops.example']);
  });

  it("gives times in UTC and the right end", () => {
    expect(props.get("DTSTART")).toEqual(["DTSTART:20261105T143000Z"]);
    expect(props.get("DTEND")).toEqual(["DTEND:20261105T150000Z"]);
    expect(props.get("DTSTAMP")).toEqual(["DTSTAMP:20261024T120000Z"]);
  });

  it("carries a stable id so re-sending updates the same event", () => {
    expect(props.get("UID")).toEqual(["UID:session-abc123@discovery-cockpit"]);
    expect(buildInvite({ ...base, sequence: 2 })).toContain("SEQUENCE:2");
  });

  it("puts the booking link in the description and the URL property", () => {
    expect(props.get("URL")).toEqual(["URL:https://calendly.com/avery/30min"]);
    expect(props.get("DESCRIPTION")![0]).toContain("Booking page: https://calendly.com/avery/30min");
  });

  it("rolls over midnight, month and year correctly", () => {
    const r = read(buildInvite({ ...base, start: new Date("2026-12-31T23:45:00Z") }));
    expect(r.props.get("DTEND")).toEqual(["DTEND:20270101T001500Z"]);
    expect(icsUtc(new Date("2027-03-01T09:05:07Z"))).toBe("20270301T090507Z");
  });

  it("converts any offset to UTC", () => {
    const r = read(buildInvite({ ...base, start: new Date("2026-11-05T09:30:00-05:00") }));
    expect(r.props.get("DTSTART")).toEqual(["DTSTART:20261105T143000Z"]);
  });
});

describe("text is escaped, so a title cannot start a new property", () => {
  it("escapes backslash, semicolon, comma and newline", () => {
    expect(icsText("a;b,c\\d\ne")).toBe("a\;b\\,c\\\\d\\ne");
    expect(icsText("one\r\ntwo\rthree")).toBe("one\\ntwo\\nthree");
  });
  it("drops control characters", () => {
    expect(icsText("A\u0000B\u0007C\u007fD")).toBe("ABCD");
  });

  it.each([
    ["summary", { summary: "Hi\r\nATTENDEE;ROLE=CHAIR:mailto:evil@x.test" }],
    ["summary (bare LF)", { summary: "Hi\nEND:VEVENT\nBEGIN:VEVENT\nSUMMARY:Fake" }],
    ["description", { description: "Notes\r\nORGANIZER:mailto:evil@x.test\r\nEND:VEVENT" }],
    ["attendee name", { attendee: { name: 'Eve"\r\nATTENDEE:mailto:evil@x.test', email: "priya@brightline.example" } }],
    ["organizer name", { organizer: { name: 'Mal";ROLE=CHAIR:mailto:evil@x.test\r\nX:', email: "avery@quinn-ops.example" } }],
  ])("a hostile %s adds nothing", (_n, override) => {
    const { lines, props } = read(buildInvite({ ...base, ...override } as InviteInput));
    expect(props.get("ATTENDEE")).toHaveLength(1);
    expect(props.get("ORGANIZER")).toHaveLength(1);
    expect(props.get("SUMMARY")).toHaveLength(1);
    expect(lines.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(1);
    expect(lines.filter((l) => l === "END:VEVENT")).toHaveLength(1);
    expect(lines.filter((l) => /mailto:evil@x\.test/.test(l) && !/^(ATTENDEE|ORGANIZER|SUMMARY|DESCRIPTION)/.test(l))).toEqual([]);
    // The exact shape: one quoted CN with no quote inside it, then only the parameters WE set.
    expect(props.get("ATTENDEE")![0]).toMatch(/^ATTENDEE;CN="[^"]*";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:priya@brightline\.example$/);
    expect(props.get("ORGANIZER")![0]).toMatch(/^ORGANIZER;CN="[^"]*":mailto:avery@quinn-ops\.example$/);
  });

  it("falls back to a neutral name when none survives cleaning", () => {
    expect(read(buildInvite({ ...base, attendee: { name: '""\n', email: "priya@brightline.example" } })).props.get("ATTENDEE")![0]).toContain('CN="Guest"');
  });
});

describe("validation", () => {
  const bad = (override: Partial<InviteInput>) => () => buildInvite({ ...base, ...override });
  it.each([
    ["an address with a header injection", { attendee: { name: "x", email: "a@b.co\r\nBcc: evil@x.test" } }],
    ["two addresses", { attendee: { name: "x", email: "a@b.co,c@d.co" } }],
    ["an address with a space", { attendee: { name: "x", email: "a b@c.co" } }],
    ["no address", { organizer: { name: "x", email: "" } }],
    ["a bad uid", { uid: "x\r\nEND:VEVENT" }],
    ["an empty uid", { uid: "" }],
    ["an invalid date", { start: new Date("nope") }],
    ["a 4 minute meeting", { durationMinutes: 4 }],
    ["a 9 hour meeting", { durationMinutes: 481 }],
    ["a fractional duration", { durationMinutes: 30.5 }],
    ["an empty title", { summary: "   " }],
    ["a 201 character title", { summary: "x".repeat(201) }],
    ["a 2001 character description", { description: "x".repeat(2001) }],
    ["a javascript: link", { url: "javascript:alert(1)" }],
    ["a file: link", { url: "file:///etc/passwd" }],
    ["a relative link", { url: "/book" }],
  ])("refuses %s", (_n, override) => {
    expect(bad(override as Partial<InviteInput>)).toThrow(InviteError);
  });
  it("accepts a missing link and an http link", () => {
    expect(read(buildInvite({ ...base, url: null })).props.has("URL")).toBe(false);
    expect(read(buildInvite({ ...base, url: "http://example.test/book" })).props.get("URL")).toEqual(["URL:http://example.test/book"]);
  });
});

describe("line folding", () => {
  const octets = (s: string) => Buffer.byteLength(s, "utf8");

  it("keeps every physical line within 75 octets and unfolds back to the original", () => {
    const long = "Quarterly review with a very long title ".repeat(5).trim();
    const ics = buildInvite({ ...base, summary: long.slice(0, 200), description: "d".repeat(500) });
    for (const line of ics.split("\r\n")) expect(octets(line), line).toBeLessThanOrEqual(75);
    expect(read(ics).props.get("SUMMARY")![0]).toBe(`SUMMARY:${icsText(long.slice(0, 200))}`);
  });

  it("never splits a multi-byte character", () => {
    const text = "Réunion de suivi 📅 ".repeat(8).trim();
    const folded = fold(`SUMMARY:${text}`);
    for (const physical of folded.split("\r\n")) {
      expect(octets(physical)).toBeLessThanOrEqual(75);
      expect(Buffer.from(physical, "utf8").toString("utf8")).toBe(physical);
      expect(physical.includes("�")).toBe(false);
    }
    expect(folded.replace(/\r\n /g, "")).toBe(`SUMMARY:${text}`);
  });

  it("leaves a short line alone", () => {
    expect(fold("SUMMARY:Short")).toBe("SUMMARY:Short");
  });
});

// ---------------------------------------------------------------------------------------------

describe("which booking pages may be embedded", () => {
  it.each([
    ["https://calendly.com/avery/30min", true],
    ["https://CALENDLY.com/avery", true],
    ["https://cal.com/avery/intro", true],
    ["https://app.cal.com/avery", true],
    ["https://savvycal.com/avery/chat", true],
    ["https://tidycal.com/avery/30", true],
    ["https://youcanbook.me/avery", true],
    ["http://calendly.com/avery", false], // https only
    ["https://calendly.com.evil.test/avery", false],
    ["https://evilcalendly.com/avery", false],
    ["https://notcal.com/avery", false],
    ["https://calendly.com@evil.test/avery", false], // the host is evil.test
    ["https://user:pw@calendly.com/avery", false],
    ["https://calendly.com:8443/avery", false],
    ["https://evil.test/?u=https://calendly.com/avery", false],
    ["https://evil.test/calendly.com", false],
    ["javascript:alert(1)", false],
    ["data:text/html,<script>1</script>", false],
    ["//calendly.com/avery", false],
    ["calendly.com/avery", false],
    ["", false],
    ["https://outlook.office365.com/book/x", false], // plausible, but not on the list
  ])("%s -> %s", (url, expected) => {
    expect(embeddableBooking(url)).toBe(expected);
  });
  it("the list is short and every entry is a bare domain", () => {
    expect(EMBED_HOSTS.length).toBeLessThanOrEqual(8);
    for (const h of EMBED_HOSTS) expect(h).toMatch(/^[a-z0-9.-]+\.[a-z]+$/);
  });
});

describe("embedding in the review", () => {
  const consultant = { name: "Avery Quinn", businessName: "Quinn Studio", tagline: null };
  const input = { consultant, branding: { primaryColor: "#0f766e", accentColor: "#d97706", logoUrl: null }, client: { name: "Priya", companyName: "Brightline" }, analysis: analyze(DEMO_SEGMENTS.map((s, order) => ({ ...s, order })), { type: "DISCOVERY" }), generatedAt: new Date("2026-10-24T12:00:00Z") };
  const build = (bookingUrl: string | null, embedBooking: boolean) => buildRevealData({ ...input, bookingUrl, embedBooking });

  it("is off unless the consultant opted in, even for a known provider", () => {
    expect(build("https://calendly.com/avery", false).booking?.embed).toBe(false);
  });
  it("is on only when opted in AND the provider is on the list", () => {
    expect(build("https://calendly.com/avery", true).booking?.embed).toBe(true);
    expect(build("https://example.test/book", true).booking?.embed).toBe(false);
  });

  it("a payload that claims to embed an unknown page fails closed", () => {
    const d = JSON.parse(JSON.stringify(build("https://example.test/book", false)));
    d.booking.embed = true;
    expect(revealSchema.safeParse(d).success).toBe(false);
    d.booking.url = "https://calendly.com.evil.test/x";
    expect(revealSchema.safeParse(d).success).toBe(false);
  });

  it("a report stored before the field existed reads as not embedded", () => {
    const d = JSON.parse(JSON.stringify(build("https://calendly.com/avery", false)));
    delete d.booking.embed;
    expect(revealSchema.parse(d).booking?.embed).toBe(false);
  });

  it("renders a sandboxed, titled, lazy frame only when embedding", () => {
    const on = renderToStaticMarkup(<RevealView data={build("https://calendly.com/avery", true)} />);
    const frame = on.match(/<iframe[^>]*>/)![0];
    expect(frame).toContain('src="https://calendly.com/avery"');
    expect(frame).toContain('title="Book a time with Avery Quinn"');
    expect(frame).toContain('loading="lazy"');
    expect(frame).toMatch(/sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"/);
    expect(frame).not.toMatch(/allow-top-navigation/); // the embedded page cannot navigate the review away
    expect(on).toContain("Booking page provided by calendly.com");
    expect(on).toContain('data-testid="booking-link"'); // the plain button is still there as a fallback
    expect(on).toMatch(/print:hidden[^"]*" data-testid="booking-embed"/);

    for (const [url, optIn] of [["https://calendly.com/avery", false], ["https://example.test/book", true], [null, true]] as const) {
      expect(renderToStaticMarkup(<RevealView data={build(url, optIn)} />), `${url} ${optIn}`).not.toContain("<iframe");
    }
  });
});
