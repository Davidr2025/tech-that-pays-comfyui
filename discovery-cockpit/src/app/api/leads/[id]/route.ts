import { NextResponse } from "next/server";
import { errorResponse, jsonError } from "@/lib/api";
import { apiConsultant } from "@/server/auth";
import { deleteLead } from "@/server/leads";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await apiConsultant(req);
  if ("error" in who) return who.error;
  if (!who.consultant) return jsonError("No consultant exists yet. Run `npm run db:seed`.", 409);
  const { id } = await params;
  try {
    await deleteLead(who.consultant.id, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
