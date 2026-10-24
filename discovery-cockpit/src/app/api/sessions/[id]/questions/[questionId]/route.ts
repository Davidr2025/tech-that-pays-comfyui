import { guardSession } from "@/server/auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, readBody } from "@/lib/api";
import { deleteQuestion, updateQuestion } from "@/server/questions";
import { toQuestionView } from "@/server/question-view";

const body = z
  .object({ covered: z.boolean().optional(), notes: z.string().nullable().optional(), text: z.string().optional() })
  .strict()
  .refine((b) => Object.keys(b).length > 0, "Nothing to change.");

type Ctx = { params: Promise<{ id: string; questionId: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id, questionId } = await params;
  const denied = await guardSession(req, id);
  if (denied) return denied;
  const parsed = await readBody(req, body);
  if ("error" in parsed) return parsed.error;
  try {
    return NextResponse.json({ question: toQuestionView(await updateQuestion(id, questionId, parsed.data)) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id, questionId } = await params;
  const denied = await guardSession(req, id);
  if (denied) return denied;
  try {
    await deleteQuestion(id, questionId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
