import { NextResponse } from "next/server";
import { errorResponse, jsonError, readBody } from "@/lib/api";
import { consultantSchema } from "@/lib/validation";
import { getConsultant, updateConsultant } from "@/server/consultant";

export async function PUT(req: Request) {
  const parsed = await readBody(req, consultantSchema);
  if ("error" in parsed) return parsed.error;
  const consultant = await getConsultant();
  if (!consultant) return jsonError("No consultant exists yet. Run `npm run db:seed`.", 409);
  try {
    await updateConsultant(consultant.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Could not save your settings.");
  }
}
