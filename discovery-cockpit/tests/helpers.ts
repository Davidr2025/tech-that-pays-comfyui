import { prisma } from "@/lib/db";
import { createDefaultQuestions } from "@/server/questions";
import { demoTranscript, replaceTranscript } from "@/server/sessions";

let counter = 0;

/** A fresh consultant + client + session loaded with the demo transcript. */
export async function makeDemoSession(label: string) {
  const n = `${label}-${Date.now()}-${counter++}`;
  const consultant = await prisma.consultant.create({
    data: { name: "Test Consultant", email: `${n}@example.test`, businessName: "Test Studio", tagline: "Testing", primaryColor: "#1d4ed8", accentColor: "#e11d48" },
  });
  const client = await prisma.client.create({
    data: { consultantId: consultant.id, name: "Pat Client", companyName: "Acme Heating" },
  });
  const session = await prisma.session.create({
    data: { consultantId: consultant.id, clientId: client.id, type: "DISCOVERY", title: `Test ${n}` },
  });
  await createDefaultQuestions(session.id);
  await replaceTranscript(session.id, demoTranscript());
  return session;
}

/** Every object key anywhere in a JSON-like value. */
export function deepKeys(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => deepKeys(v, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      deepKeys(v, out);
    }
  }
  return out;
}

/** Which of `needles` appear (case-insensitively) in `haystack`. */
export function findLeaks(haystack: string, needles: string[]): string[] {
  const lower = haystack.toLowerCase();
  return needles.filter((n) => lower.includes(n.toLowerCase()));
}

/** Visible text of rendered HTML: tags stripped, entities decoded (React escapes ' as &#x27;). */
export function htmlToText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

/** How many times `needle` occurs in `haystack` (case-insensitive). */
export function occurrences(haystack: string, needle: string): number {
  return haystack.toLowerCase().split(needle.toLowerCase()).length - 1;
}

/** Words that must never appear anywhere in the page a client sees (body, title, meta). */
export const FORBIDDEN_TEXT = [
  "coaching",
  "internal note",
  "internalnotes",
  "decision readiness",
  "decisionreadiness",
  "readiness",
  "buying signal",
  "objection",
  "talk ratio",
  "reflect back",
  "suggested question",
  "severity",
  "private",
  "consultant view",
];
