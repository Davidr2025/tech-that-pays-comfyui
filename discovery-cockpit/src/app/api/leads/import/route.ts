import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, jsonError, readBody } from "@/lib/api";
import { CSV_LIMITS } from "@/lib/csv";
import { apiConsultant } from "@/server/auth";
import { importLeads } from "@/server/leads";

const body = z.object({ csv: z.string().max(CSV_LIMITS.chars, "That file is too large.") }).strict();

/** Imports leads from CSV text the consultant supplied. Reads nothing from the network. */
export async function POST(req: Request) {
  const who = await apiConsultant(req);
  if ("error" in who) return who.error;
  if (!who.consultant) return jsonError("No consultant exists yet. Run `npm run db:seed`.", 409);
  const parsed = await readBody(req, body);
  if ("error" in parsed) return parsed.error;
  try {
    return NextResponse.json(await importLeads(who.consultant.id, parsed.data.csv));
  } catch (err) {
    return errorResponse(err, "Could not import that file.");
  }
}
