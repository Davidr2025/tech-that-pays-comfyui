import { NextResponse } from "next/server";
import { resetQuestions } from "@/server/questions";

/** Clears coverage for every question in the session (Restart). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await resetQuestions(id);
  return NextResponse.json({ ok: true });
}
