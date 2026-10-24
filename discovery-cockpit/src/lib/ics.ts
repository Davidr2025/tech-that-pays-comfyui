/**
 * A calendar invitation as an iCalendar (RFC 5545) file. Sent as an attachment (or downloaded), it
 * invites the attendee by email in every major calendar app, with no calendar account or OAuth.
 *
 * Every value is validated or escaped: a newline in a name or title must never be able to start a new
 * property (that is how calendar-invite injection works), so text is escaped per RFC 5545 section 3.3.11,
 * addresses must match a strict pattern, and lines are folded at 75 octets without splitting a character.
 */
import { SAFE_ADDRESS } from "./email";

export interface InviteInput {
  /** Stable id so a re-sent invite updates the same event. Letters, digits and hyphens. */
  uid: string;
  start: Date;
  durationMinutes: number;
  summary: string;
  description?: string;
  /** An http(s) link people can use to join or find the meeting. */
  url?: string | null;
  organizer: { name: string; email: string };
  attendee: { name: string; email: string };
  /** When the invite was made (DTSTAMP). Defaults to now. */
  now?: Date;
  sequence?: number;
}

export class InviteError extends Error {}

const CRLF = "\r\n";
const pad = (n: number) => String(n).padStart(2, "0");

/** 20261105T143000Z */
export function icsUtc(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** TEXT values: escape backslash, semicolon, comma and line breaks; drop other control characters. */
export function icsText(s: string): string {
  return s
    .replace(/\r\n|\r|\n/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/** A CN parameter value: quoted, with characters that could end the quote or the parameter removed. */
function cn(name: string): string {
  const clean = name.replace(/[\u0000-\u001f\u007f"]/g, "").replace(/\s+/g, " ").trim();
  return `"${clean || "Guest"}"`;
}

/** Folds a content line at 75 octets (RFC 5545 section 3.1), never inside a multi-byte character. */
export function fold(line: string): string {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const size = Buffer.byteLength(ch, "utf8");
    if (bytes + size > limit) {
      out.push(current);
      current = " "; // continuation lines start with one space, which counts toward the 75
      bytes = 1;
      limit = 75;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join(CRLF);
}

function address(label: string, email: string): string {
  if (!SAFE_ADDRESS.test(email)) throw new InviteError(`${label} needs a valid email address.`);
  return email;
}

export function buildInvite(i: InviteInput): string {
  if (!/^[A-Za-z0-9-]{1,100}$/.test(i.uid)) throw new InviteError("The invite id is not valid.");
  if (!(i.start instanceof Date) || Number.isNaN(i.start.getTime())) throw new InviteError("Choose a valid start time.");
  if (!Number.isInteger(i.durationMinutes) || i.durationMinutes < 5 || i.durationMinutes > 480) throw new InviteError("A meeting runs between 5 minutes and 8 hours.");
  const summary = i.summary.trim();
  if (!summary || summary.length > 200) throw new InviteError("A meeting needs a title of up to 200 characters.");
  if ((i.description?.length ?? 0) > 2000) throw new InviteError("Keep the description under 2000 characters.");
  let url: string | null = null;
  if (i.url) {
    let parsed: URL;
    try {
      parsed = new URL(i.url);
    } catch {
      throw new InviteError("The meeting link is not a web address.");
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new InviteError("The meeting link must be http or https.");
    url = parsed.toString();
  }

  const organizer = address("The organizer", i.organizer.email);
  const attendee = address("The guest", i.attendee.email);
  const end = new Date(i.start.getTime() + i.durationMinutes * 60_000);
  const description = [i.description?.trim(), url ? `Booking page: ${url}` : null].filter(Boolean).join("\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Discovery Cockpit//Follow-up invite//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${i.uid}@discovery-cockpit`,
    `DTSTAMP:${icsUtc(i.now ?? new Date())}`,
    `DTSTART:${icsUtc(i.start)}`,
    `DTEND:${icsUtc(end)}`,
    `SEQUENCE:${i.sequence ?? 0}`,
    `SUMMARY:${icsText(summary)}`,
    ...(description ? [`DESCRIPTION:${icsText(description)}`] : []),
    ...(url ? [`URL:${url.replace(/[\u0000- ]/g, "")}`] : []),
    `ORGANIZER;CN=${cn(i.organizer.name)}:mailto:${organizer}`,
    `ATTENDEE;CN=${cn(i.attendee.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${attendee}`,
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join(CRLF) + CRLF;
}
