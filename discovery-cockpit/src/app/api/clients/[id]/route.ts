import { NextResponse } from "next/server";
import { errorResponse, jsonError, readBody } from "@/lib/api";
import { clientSchema } from "@/lib/validation";
import { apiConsultant } from "@/server/auth";
import { updateClient } from "@/server/clients";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const who = await apiConsultant(req);
  if ("error" in who) return who.error;
  if (!who.consultant) return jsonError("No consultant exists yet. Run `npm run db:seed`.", 409);
  const consultant = who.consultant;
  const parsed = await readBody(req, clientSchema);
  if ("error" in parsed) return parsed.error;
  try {
    const updated = await updateClient(consultant.id, id, parsed.data);
    return updated ? NextResponse.json({ ok: true }) : jsonError("Client not found.", 404);
  } catch (err) {
    return errorResponse(err, "Could not save the client.");
  }
}
