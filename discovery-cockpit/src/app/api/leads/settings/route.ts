import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, jsonError, readBody } from "@/lib/api";
import { optionalText } from "@/lib/validation";
import { apiConsultant } from "@/server/auth";
import { updateLeadSettings } from "@/server/leads";

const body = z.object({ enabled: z.boolean(), niche: optionalText(120), location: optionalText(120), source: optionalText(120) }).strict();

export async function PUT(req: Request) {
  const who = await apiConsultant(req);
  if ("error" in who) return who.error;
  if (!who.consultant) return jsonError("No consultant exists yet. Run `npm run db:seed`.", 409);
  const parsed = await readBody(req, body);
  if ("error" in parsed) return parsed.error;
  try {
    await updateLeadSettings(who.consultant.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Could not save the Lead Finder settings.");
  }
}
