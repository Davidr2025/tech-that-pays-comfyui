import { NextResponse } from "next/server";
import { errorResponse, jsonError, readBody } from "@/lib/api";
import { authMode } from "@/lib/auth/mode";
import { passwordChangeSchema } from "@/lib/auth/schemas";
import { changePassword } from "@/server/accounts";
import { apiConsultant, readToken } from "@/server/auth";

export async function PUT(req: Request) {
  if (authMode() === "local") return jsonError("This server runs without accounts.", 409);
  const who = await apiConsultant(req);
  if ("error" in who) return who.error;
  const parsed = await readBody(req, passwordChangeSchema);
  if ("error" in parsed) return parsed.error;
  try {
    await changePassword(who.consultant!.id, parsed.data.current, parsed.data.next, await readToken());
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Could not change the password.");
  }
}
