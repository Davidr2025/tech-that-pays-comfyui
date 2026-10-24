import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonError, readBody } from "@/lib/api";
import { MAX_SEGMENTS, MAX_TRANSCRIPT_CHARS, parseTranscript } from "@/lib/transcript";
import { demoTranscript, replaceTranscript } from "@/server/sessions";

const body = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("demo") }),
  z.object({ mode: z.literal("paste"), text: z.string().max(MAX_TRANSCRIPT_CHARS, "Transcript is too long.") }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await readBody(req, body);
  if ("error" in parsed) return parsed.error;

  const exists = await prisma.session.count({ where: { id } });
  if (!exists) return jsonError("Session not found.", 404);

  const segments = parsed.data.mode === "demo" ? demoTranscript() : parseTranscript(parsed.data.text);
  if (segments.length === 0) return jsonError("No transcript text found — paste at least one line.", 400);
  if (segments.length > MAX_SEGMENTS) return jsonError(`Transcript has more than ${MAX_SEGMENTS} segments.`, 400);

  await replaceTranscript(id, segments);
  return NextResponse.json({ segments: segments.map((s, order) => ({ order, speaker: s.speaker, text: s.text })) });
}
