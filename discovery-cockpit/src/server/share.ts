/**
 * The consultant's share kit for a built review: plain text, HTML for pasting, and the content
 * of a follow-up email. Everything is derived from the validated reveal payload only, so an
 * export cannot contain anything the client's own page could not.
 */
import { prisma } from "../lib/db";
import { buildEmailContent, revealToHtml, revealToText, type EmailContent } from "../lib/reveal/export";
import { emailMode } from "./email-smtp";
import { lastSent } from "./outgoing";
import { pdfAvailable } from "./pdf";
import { getRevealPayload } from "./reveal";

export interface ShareKit {
  to: string | null;
  email: EmailContent;
  html: string;
  text: string;
  /** What this server can do: send mail itself, and make PDF files. Everything else works regardless. */
  capabilities: { smtp: boolean; pdf: boolean };
  /** The most recent email the app sent for this session. */
  lastSent: { to: string; at: string } | null;
}

export class ShareError extends Error {
  constructor(
    public code: "NOT_FOUND" | "CONFLICT",
    message: string,
  ) {
    super(message);
  }
}

export async function getShareKit(sessionId: string): Promise<ShareKit> {
  const session = await prisma.session.findUnique({ where: { id: sessionId }, select: { client: { select: { email: true } } } });
  if (!session) throw new ShareError("NOT_FOUND", "Session not found.");
  let data;
  try {
    data = await getRevealPayload(sessionId);
  } catch {
    throw new ShareError("CONFLICT", "The stored review failed its safety check. Rebuild the client review first.");
  }
  if (!data) throw new ShareError("NOT_FOUND", "Build the client review before sharing it.");
  return {
    to: session.client.email,
    email: buildEmailContent(data),
    html: revealToHtml(data),
    text: revealToText(data),
    capabilities: { smtp: emailMode() === "smtp", pdf: await pdfAvailable() },
    lastSent: await lastSent(sessionId),
  };
}
