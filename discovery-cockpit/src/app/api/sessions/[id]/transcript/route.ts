import { guardSession } from "@/server/auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse, jsonError, readBody } from "@/lib/api";
import { MAX_SEGMENT_CHARS, MAX_SEGMENTS, MAX_TRANSCRIPT_CHARS, parseTranscriptDetailed } from "@/lib/transcript";
import { appendSegment, demoTranscript, replaceTranscript } from "@/server/sessions";

const text = z.string().max(MAX_TRANSCRIPT_CHARS, "That transcript is too large.");
const you = z.string().trim().max(60).nullish();
const swap = z.boolean().optional();

/**
 * The four transcript sources behind one endpoint:
 *   demo    the built-in call
 *   paste   text from the clipboard
 *   upload  the text of a .txt / .vtt / .srt file
 *   append  one line added live: typed, or spoken (browser speech recognition)
 * paste/upload/demo REPLACE the transcript; append adds to it.
 */
const body = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("demo") }),
  z.object({ mode: z.literal("paste"), text, you, swap }),
  z.object({ mode: z.literal("upload"), text, you, swap, fileName: z.string().max(200).optional() }),
  z.object({
    mode: z.literal("append"),
    speaker: z.enum(["CONSULTANT", "CLIENT"]),
    text: z.string().trim().min(1, "Type something first.").max(MAX_SEGMENT_CHARS),
    startSec: z.number().int().min(0).max(86_400).nullish(),
  }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const denied = await guardSession(req, id);
  if (denied) return denied;
  const parsed = await readBody(req, body);
  if ("error" in parsed) return parsed.error;
  const input = parsed.data;

  const session = await prisma.session.findUnique({ where: { id }, select: { type: true } });
  if (!session) return jsonError("Session not found.", 404);

  try {
    if (input.mode === "append") {
      const segment = await appendSegment(id, input);
      return NextResponse.json({ segment });
    }

    const result =
      input.mode === "demo"
        ? { segments: demoTranscript(session.type), speakers: [] as string[], format: "labeled" as const, needsYou: false, unattributed: false }
        : parseTranscriptDetailed(input.text, { youLabel: input.you, swapRoles: input.swap });
    if (result.segments.length === 0) return jsonError("No transcript text found. Paste at least one line.", 400);
    if (result.segments.length > MAX_SEGMENTS) return jsonError(`That transcript has more than ${MAX_SEGMENTS} turns.`, 400);

    await replaceTranscript(id, result.segments);
    return NextResponse.json({
      segments: result.segments.map((s, order) => ({ order, speaker: s.speaker, text: s.text, startSec: s.startSec ?? null })),
      format: result.format,
      speakers: result.speakers,
      unattributed: result.unattributed,
    });
  } catch (err) {
    return errorResponse(err, "Could not load that transcript.");
  }
}
