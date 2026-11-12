import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, jsonError, readBody } from "@/lib/api";
import { prisma } from "@/lib/db";
import { apiConsultant, guardSession } from "@/server/auth";
import { disableIngest, enableIngest } from "@/server/ingest";
import { publicOrigin, recallConfigured, RecallError, removeBot, sendBot } from "@/server/recall";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("link") }),
  z.object({ action: z.literal("off") }),
  z.object({ action: z.literal("bot"), meetingUrl: z.string().trim().min(1).max(600) }),
  z.object({ action: z.literal("bot-leave") }),
]);

const state = async (id: string) => {
  const s = await prisma.session.findUnique({ where: { id }, select: { ingestTokenHash: true, botId: true } });
  return { linkOn: Boolean(s?.ingestTokenHash), botOn: Boolean(s?.botId), botAvailable: recallConfigured() && publicOrigin() !== null };
};

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const denied = await guardSession(req, id);
  if (denied) return denied;
  return NextResponse.json(await state(id));
}

/** Turn the session's live-ingest link on or off, or send / recall the meeting bot. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const denied = await guardSession(req, id);
  if (denied) return denied;
  const who = await apiConsultant(req);
  if ("error" in who) return who.error;
  const parsed = await readBody(req, body);
  if ("error" in parsed) return parsed.error;
  const input = parsed.data;
  try {
    const session = await prisma.session.findUnique({ where: { id }, select: { status: true, botId: true } });
    if (!session) return jsonError("Session not found.", 404);
    if (session.status === "COMPLETED" && (input.action === "link" || input.action === "bot")) return jsonError("This session is complete. Start a new one for the next call.", 409);

    if (input.action === "link") {
      // The path is shown once; only its hash is kept. Asking again replaces it.
      return NextResponse.json({ ...(await state(id)), linkOn: true, path: `/api/ingest/${await enableIngest(id)}` });
    }
    if (input.action === "off") {
      await disableIngest(id);
      return NextResponse.json(await state(id));
    }
    if (input.action === "bot-leave") {
      if (session.botId) await removeBot(session.botId).catch(() => undefined); // it may already have left
      await prisma.session.update({ where: { id }, data: { botId: null } });
      await disableIngest(id);
      return NextResponse.json(await state(id));
    }
    const origin = publicOrigin();
    if (!recallConfigured() || !origin) return jsonError("No note-taker service is configured on this server.", 409);
    const token = await enableIngest(id);
    const botId = await sendBot({ meetingUrl: input.meetingUrl, webhookUrl: `${origin}/api/ingest/${token}`, botName: `${who.consultant?.name ?? "Consultant"}'s note-taker` });
    await prisma.session.update({ where: { id }, data: { botId } });
    return NextResponse.json(await state(id));
  } catch (err) {
    if (err instanceof RecallError) return jsonError(err.message, err.code === "INVALID" ? 400 : err.code === "UNAVAILABLE" ? 409 : 502);
    return errorResponse(err, "Could not change the live connection.");
  }
}
