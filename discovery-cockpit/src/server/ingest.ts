/**
 * Live ingest: a per-session secret URL that a note-taker (a meeting bot, or any tool that can POST) sends transcript
 * lines to while the call is happening. The URL is the credential: 256 random bits, stored only as a SHA-256, shown
 * once, replaceable and revocable. It can do exactly one thing: append lines to that one session's transcript.
 */
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../lib/db";
import { makeLimiter } from "../lib/auth/rate-limit";
import { parseIngest } from "../lib/ingest";
import { appendSegment, SessionError } from "./sessions";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
/** Per URL, per server process: far above a real conversation, far below a flood. */
const limiter = makeLimiter({ max: 240, windowMs: 60_000 });

export async function enableIngest(sessionId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.session.update({ where: { id: sessionId }, data: { ingestTokenHash: hash(token) } });
  return token;
}

export async function disableIngest(sessionId: string) {
  await prisma.session.update({ where: { id: sessionId }, data: { ingestTokenHash: null } });
}

export type IngestOutcome = { status: 200; accepted: number } | { status: 400 | 404 | 409 | 429; error: string };

export async function ingest(token: string, body: unknown, me: string | null): Promise<IngestOutcome> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return { status: 404, error: "Not found." };
  const key = hash(token);
  const session = await prisma.session.findUnique({ where: { ingestTokenHash: key }, select: { id: true, consultant: { select: { name: true } } } });
  if (!session) return { status: 404, error: "Not found." };
  if (limiter.retryAfter(key) > 0) return { status: 429, error: "Too many lines. Slow down." };

  const parsed = parseIngest(body, [session.consultant.name, session.consultant.name.split(/\s+/)[0] ?? "", ...(me ? [me] : [])]);
  if (!parsed.ok) return { status: 400, error: parsed.error };
  let accepted = 0;
  for (const line of parsed.lines) {
    limiter.fail(key);
    try {
      await appendSegment(session.id, line);
      accepted++;
    } catch (err) {
      if (err instanceof SessionError && err.code === "CONFLICT") return { status: 409, error: "This session is finished and no longer accepts lines." };
      throw err;
    }
  }
  return { status: 200, accepted };
}
