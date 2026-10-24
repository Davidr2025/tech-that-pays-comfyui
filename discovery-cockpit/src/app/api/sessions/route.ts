import { NextResponse } from "next/server";
import { errorResponse, jsonError, readBody } from "@/lib/api";
import { sessionCreateSchema } from "@/lib/validation";
import { getConsultant } from "@/server/consultant";
import { createSession } from "@/server/sessions";

export async function POST(req: Request) {
  const parsed = await readBody(req, sessionCreateSchema);
  if ("error" in parsed) return parsed.error;
  const consultant = await getConsultant();
  if (!consultant) return jsonError("No consultant exists yet. Run `npm run db:seed`.", 409);
  try {
    const session = await createSession(consultant.id, parsed.data);
    return NextResponse.json({ id: session.id }, { status: 201 });
  } catch (err) {
    return errorResponse(err, "Could not create the session.");
  }
}
