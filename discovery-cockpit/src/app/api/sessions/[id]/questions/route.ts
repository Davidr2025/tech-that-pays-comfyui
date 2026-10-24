import { guardSession } from "@/server/auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, readBody } from "@/lib/api";
import { addQuestion, resetQuestions } from "@/server/questions";
import { toQuestionView } from "@/server/question-view";

const addBody = z.object({ text: z.string() }).strict();

/** Adds a question of the consultant's own to this session's checklist. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const denied = await guardSession(req, id);
  if (denied) return denied;
  const parsed = await readBody(req, addBody);
  if ("error" in parsed) return parsed.error;
  try {
    return NextResponse.json({ question: toQuestionView(await addQuestion(id, parsed.data.text)) }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Clears coverage for every question in the session (Restart). */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const denied = await guardSession(req, id);
  if (denied) return denied;
  await resetQuestions(id);
  return NextResponse.json({ ok: true });
}
