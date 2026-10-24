import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, readBody } from "@/lib/api";
import { guardSession } from "@/server/auth";
import { sendReviewEmail } from "@/server/outgoing";

// Deliberately no recipient, subject or text: the app writes the email and sends it to the client on file.
const body = z
  .object({
    attachPdf: z.boolean().default(false),
    invite: z.object({ start: z.string().min(1).max(40), minutes: z.number().int() }).strict().optional(),
  })
  .strict();

/** Emails the client the summary of the review (with the PDF and a calendar invitation if asked). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const denied = await guardSession(req, id);
  if (denied) return denied;
  const parsed = await readBody(req, body);
  if ("error" in parsed) return parsed.error;
  try {
    const { to, sentAt } = await sendReviewEmail(id, parsed.data);
    return NextResponse.json({ sent: true, to, sentAt: sentAt.toISOString() });
  } catch (err) {
    return errorResponse(err, "Could not send the email.");
  }
}
