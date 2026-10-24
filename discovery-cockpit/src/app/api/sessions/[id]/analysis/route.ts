import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, jsonError, readBody } from "@/lib/api";
import { liveAnalysis } from "@/server/ai/live";
import { apiConsultant, guardSession } from "@/server/auth";

const body = z.object({ upTo: z.number().int().min(0).max(100_000), reset: z.boolean().optional() });

/**
 * Live analysis of the call so far when the consultant has chosen Claude. The browser only ever asks for a line
 * number; the server decides what to send, so a request cannot ask Claude anything it chooses.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const denied = await guardSession(req, id);
  if (denied) return denied;
  const who = await apiConsultant(req);
  if ("error" in who) return who.error;
  if (!who.consultant) return jsonError("No consultant exists yet. Run `npm run db:seed`.", 409);
  const parsed = await readBody(req, body);
  if ("error" in parsed) return parsed.error;
  try {
    const answer = await liveAnalysis({ sessionId: id, consultant: who.consultant, upTo: parsed.data.upTo, reset: parsed.data.reset ?? false });
    return answer ? NextResponse.json(answer) : jsonError("Session not found.", 404);
  } catch (err) {
    return errorResponse(err, "Could not analyse the call.");
  }
}
