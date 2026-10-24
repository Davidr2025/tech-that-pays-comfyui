import { NextResponse } from "next/server";
import { errorResponse, jsonError, readBody } from "@/lib/api";
import { consultantSchema } from "@/lib/validation";
import { apiConsultant } from "@/server/auth";
import { updateConsultant } from "@/server/consultant";

export async function PUT(req: Request) {
  const who = await apiConsultant(req);
  if ("error" in who) return who.error;
  if (!who.consultant) return jsonError("No consultant exists yet. Run `npm run db:seed`.", 409);
  const consultant = who.consultant;
  const parsed = await readBody(req, consultantSchema);
  if ("error" in parsed) return parsed.error;
  try {
    await updateConsultant(consultant.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Could not save your settings.");
  }
}
