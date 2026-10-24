import { NextResponse } from "next/server";
import { errorResponse, jsonError } from "@/lib/api";
import { apiConsultant } from "@/server/auth";
import { clearLeads } from "@/server/leads";

/** Removes every lead on the signed-in consultant's list. */
export async function DELETE(req: Request) {
  const who = await apiConsultant(req);
  if ("error" in who) return who.error;
  if (!who.consultant) return jsonError("No consultant exists yet. Run `npm run db:seed`.", 409);
  try {
    return NextResponse.json({ removed: await clearLeads(who.consultant.id) });
  } catch (err) {
    return errorResponse(err, "Could not clear the list.");
  }
}
