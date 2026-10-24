import { NextResponse } from "next/server";
import { errorResponse, jsonError, readBody } from "@/lib/api";
import { clientSchema } from "@/lib/validation";
import { getConsultant } from "@/server/consultant";
import { createClient } from "@/server/clients";

export async function POST(req: Request) {
  const parsed = await readBody(req, clientSchema);
  if ("error" in parsed) return parsed.error;
  const consultant = await getConsultant();
  if (!consultant) return jsonError("No consultant exists yet. Run `npm run db:seed`.", 409);
  try {
    const client = await createClient(consultant.id, parsed.data);
    return NextResponse.json({ id: client.id }, { status: 201 });
  } catch (err) {
    return errorResponse(err, "Could not save the client.");
  }
}
