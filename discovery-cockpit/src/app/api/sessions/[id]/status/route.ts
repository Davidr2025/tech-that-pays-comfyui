import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, readBody } from "@/lib/api";
import { setSessionStatus } from "@/server/sessions";

// Only the two statuses a consultant sets by hand. LIVE and REVIEW follow from loading a
// transcript and building the review.
const body = z.object({ to: z.enum(["REVEALED", "COMPLETED"]) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await readBody(req, body);
  if ("error" in parsed) return parsed.error;
  try {
    return NextResponse.json({ status: await setSessionStatus(id, parsed.data.to) });
  } catch (err) {
    return errorResponse(err);
  }
}
