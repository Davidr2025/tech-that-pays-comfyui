/**
 * The consultant's share kit for a built review: plain text, HTML for pasting, and the content
 * of a follow-up email. Everything is derived from the validated reveal payload only, so an
 * export cannot contain anything the client's own page could not.
 */
import { prisma } from "../lib/db";
import { buildEmailContent, revealToHtml, revealToText, type EmailContent } from "../lib/reveal/export";
import { getRevealPayload } from "./reveal";

export interface ShareKit {
  to: string | null;
  email: EmailContent;
  html: string;
  text: string;
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
  return { to: session.client.email, email: buildEmailContent(data), html: revealToHtml(data), text: revealToText(data) };
}
