import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, readBody } from "@/lib/api";
import { setQuestionCovered } from "@/server/questions";

const body = z.object({ covered: z.boolean() });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; questionId: string }> }) {
  const { id, questionId } = await params;
  const parsed = await readBody(req, body);
  if ("error" in parsed) return parsed.error;
  const ok = await setQuestionCovered(id, questionId, parsed.data.covered);
  return ok ? NextResponse.json({ ok: true }) : jsonError("Question not found.", 404);
}
