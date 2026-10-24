import { NextResponse } from "next/server";
import { errorResponse, jsonError, readBody } from "@/lib/api";
import { clientSchema } from "@/lib/validation";
import { apiConsultant } from "@/server/auth";
import { createClient } from "@/server/clients";

export async function POST(req: Request) {
  const who = await apiConsultant(req);
  if ("error" in who) return who.error;
  if (!who.consultant) return jsonError("No consultant exists yet. Run `npm run db:seed`.", 409);
  const consultant = who.consultant;
  const parsed = await readBody(req, clientSchema);
  if ("error" in parsed) return parsed.error;
  try {
    const client = await createClient(consultant.id, parsed.data);
    return NextResponse.json({ id: client.id }, { status: 201 });
  } catch (err) {
    return errorResponse(err, "Could not save the client.");
  }
}
