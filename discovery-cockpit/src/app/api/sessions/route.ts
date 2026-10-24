import { NextResponse } from "next/server";
import { errorResponse, jsonError, readBody } from "@/lib/api";
import { sessionCreateSchema } from "@/lib/validation";
import { apiConsultant } from "@/server/auth";
import { createSession } from "@/server/sessions";

export async function POST(req: Request) {
  const who = await apiConsultant(req);
  if ("error" in who) return who.error;
  if (!who.consultant) return jsonError("No consultant exists yet. Run `npm run db:seed`.", 409);
  const consultant = who.consultant;
  const parsed = await readBody(req, sessionCreateSchema);
  if ("error" in parsed) return parsed.error;
  try {
    const session = await createSession(consultant.id, parsed.data);
    return NextResponse.json({ id: session.id }, { status: 201 });
  } catch (err) {
    return errorResponse(err, "Could not create the session.");
  }
}
