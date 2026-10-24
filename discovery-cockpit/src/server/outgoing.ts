/**
 * Everything that leaves the app on the consultant's behalf: PDF files, calendar invites, and the
 * email to the client. Callers must already have passed `guardSession`.
 *
 * The email cannot be turned into a mail relay: the recipient is the address on the client's record
 * (never one supplied with the request), the text is built here from the validated review, and each
 * consultant can send a few per hour. Every send is logged.
 */
import { prisma } from "../lib/db";
import { SAFE_ADDRESS } from "../lib/email";
import { buildInvite, InviteError } from "../lib/ics";
import { makeLimiter } from "../lib/auth/rate-limit";
import { buildEmailContent } from "../lib/reveal/export";
import { getRevealPayload } from "./reveal";
import { emailMode, EmailSendError, smtpConfig, smtpProvider } from "./email-smtp";
import { internalBase, PdfError, renderPdf } from "./pdf";

export class OutgoingError extends Error {
  constructor(
    public code: "NOT_FOUND" | "INVALID" | "CONFLICT" | "LOCKED" | "UPSTREAM" | "UNAVAILABLE",
    message: string,
    public retryAfter = 0,
  ) {
    super(message);
  }
}

/** Emails: 10 an hour per consultant. PDFs: 20. Counted per attempt, so a failing mail server cannot be hammered either. */
export const sendLimiter = makeLimiter({ max: 10, windowMs: 3_600_000 });
export const pdfLimiter = makeLimiter({ max: 20, windowMs: 3_600_000 });

function spend(limiter: typeof sendLimiter, key: string, what: string) {
  const wait = limiter.retryAfter(key);
  if (wait > 0) throw new OutgoingError("LOCKED", `That is the hourly limit for ${what}. Try again in ${Math.ceil(wait / 60)} minute${wait > 60 ? "s" : ""}.`, wait);
  limiter.fail(key);
}

export type DocumentKind = "review" | "prototype";

const slug = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "client";

function pdfFailure(err: unknown): never {
  if (err instanceof PdfError) {
    if (err.code === "BUSY") throw new OutgoingError("UNAVAILABLE", err.message);
    if (err.code === "NOT_CONFIGURED") throw new OutgoingError("CONFLICT", err.message);
    throw new OutgoingError("UPSTREAM", err.message);
  }
  throw err;
}

/** A PDF of the review or the prototype, made from the app's own public print view. */
export async function documentPdf(sessionId: string, kind: DocumentKind): Promise<{ filename: string; pdf: Buffer }> {
  const session = await prisma.session.findUnique({ where: { id: sessionId }, select: { consultantId: true, client: { select: { companyName: true } }, report: { select: { id: true } }, _count: { select: { prototype: true } } } });
  if (!session) throw new OutgoingError("NOT_FOUND", "Session not found.");
  if (kind === "review" && !session.report) throw new OutgoingError("NOT_FOUND", "Build the client review before making a PDF.");
  if (kind === "prototype" && session._count.prototype === 0) throw new OutgoingError("NOT_FOUND", "This session has no prototype.");
  spend(pdfLimiter, session.consultantId, "making PDFs");
  try {
    const pdf = await renderPdf(`${internalBase()}/${kind === "review" ? "reveal" : "prototype"}/${sessionId}`);
    return { filename: `${slug(session.client.companyName)}-${kind}.pdf`, pdf };
  } catch (err) {
    return pdfFailure(err);
  }
}

export interface InviteRequest {
  /** ISO 8601 with an offset. */
  start: string;
  minutes: number;
}

const MAX_AHEAD_MS = 2 * 365 * 24 * 3_600_000;

/** The calendar invitation for a follow-up meeting with this session's client. */
export async function inviteFor(sessionId: string, req: InviteRequest, now = new Date()): Promise<{ filename: string; ics: string }> {
  const session = await prisma.session.findUnique({ where: { id: sessionId }, include: { client: true, consultant: true, report: { select: { revealData: true } } } });
  if (!session) throw new OutgoingError("NOT_FOUND", "Session not found.");
  if (!session.client.email) throw new OutgoingError("CONFLICT", "Add an email address to this client before inviting them.");
  const start = new Date(req.start);
  if (Number.isNaN(start.getTime())) throw new OutgoingError("INVALID", "Choose a valid start time.");
  if (start.getTime() <= now.getTime()) throw new OutgoingError("INVALID", "Choose a time in the future.");
  if (start.getTime() > now.getTime() + MAX_AHEAD_MS) throw new OutgoingError("INVALID", "Choose a time within the next two years.");
  const booking = await getRevealPayload(sessionId).then((d) => d?.booking?.url ?? null).catch(() => null);
  try {
    const ics = buildInvite({
      uid: `${session.id}-${Math.floor(start.getTime() / 60_000)}`,
      start,
      durationMinutes: req.minutes,
      summary: `Follow-up: ${session.client.companyName}`,
      description: `Follow-up conversation with ${session.consultant.name} about the ${session.type === "DISCOVERY" ? "discovery call" : "assessment"}.`,
      url: booking,
      organizer: { name: session.consultant.name, email: session.consultant.email },
      attendee: { name: session.client.name, email: session.client.email },
      now,
    });
    return { filename: "invite.ics", ics };
  } catch (err) {
    if (err instanceof InviteError) throw new OutgoingError("INVALID", err.message);
    throw err;
  }
}

export interface SendOptions {
  attachPdf: boolean;
  invite?: InviteRequest;
}

/** Emails the client the plain-language summary of the review, optionally with the PDF and a calendar invitation. */
export async function sendReviewEmail(sessionId: string, opts: SendOptions): Promise<{ to: string; sentAt: Date }> {
  const cfg = smtpConfig();
  if (!cfg || emailMode() !== "smtp") throw new OutgoingError("CONFLICT", "Email sending is not set up on this server. Use the draft link instead.");
  const session = await prisma.session.findUnique({ where: { id: sessionId }, include: { client: true, consultant: true } });
  if (!session) throw new OutgoingError("NOT_FOUND", "Session not found.");
  let data;
  try {
    data = await getRevealPayload(sessionId);
  } catch {
    throw new OutgoingError("CONFLICT", "The stored review failed its safety check. Rebuild the client review first.");
  }
  if (!data) throw new OutgoingError("NOT_FOUND", "Build the client review before sending it.");
  const to = session.client.email;
  if (!to) throw new OutgoingError("CONFLICT", "Add an email address to this client first.");
  if (!SAFE_ADDRESS.test(to)) throw new OutgoingError("CONFLICT", "The email address on this client is not valid. Fix it on the client page.");

  // Everything that can be checked without side effects comes before the rate limit is spent.
  const invite = opts.invite ? await inviteFor(sessionId, opts.invite) : null;
  spend(sendLimiter, session.consultantId, "sending email");

  const attachments: { filename: string; content: Uint8Array; contentType: string }[] = [];
  if (opts.attachPdf) {
    try {
      const pdf = await renderPdf(`${internalBase()}/reveal/${sessionId}`);
      attachments.push({ filename: `${slug(session.client.companyName)}-review.pdf`, content: pdf, contentType: "application/pdf" });
    } catch (err) {
      return pdfFailure(err); // nothing is sent without the PDF the consultant asked for
    }
  }

  const content = buildEmailContent(data);
  try {
    await smtpProvider(cfg).deliver({
      to,
      replyTo: session.consultant.email,
      fromName: session.consultant.name,
      subject: content.subject,
      parts: content.parts,
      attachments,
      ...(invite ? { calendar: { method: "REQUEST" as const, content: invite.ics } } : {}),
    });
  } catch (err) {
    if (err instanceof EmailSendError) throw new OutgoingError("UPSTREAM", err.message);
    throw err;
  }
  const row = await prisma.emailSend.create({ data: { sessionId, to, subject: content.subject, withPdf: opts.attachPdf, withInvite: Boolean(invite) } });
  return { to, sentAt: row.sentAt };
}

export async function lastSent(sessionId: string) {
  const row = await prisma.emailSend.findFirst({ where: { sessionId }, orderBy: { sentAt: "desc" } });
  return row ? { to: row.to, at: row.sentAt.toISOString() } : null;
}
