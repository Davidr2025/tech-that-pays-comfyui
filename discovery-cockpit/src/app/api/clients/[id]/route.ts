import { NextResponse } from "next/server";
import { errorResponse, jsonError, readBody } from "@/lib/api";
import { clientSchema } from "@/lib/validation";
import { getConsultant } from "@/server/consultant";
import { updateClient } from "@/server/clients";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await readBody(req, clientSchema);
  if ("error" in parsed) return parsed.error;
  const consultant = await getConsultant();
  if (!consultant) return jsonError("No consultant exists yet. Run `npm run db:seed`.", 409);
  try {
    const updated = await updateClient(consultant.id, id, parsed.data);
    return updated ? NextResponse.json({ ok: true }) : jsonError("Client not found.", 404);
  } catch (err) {
    return errorResponse(err, "Could not save the client.");
  }
}
