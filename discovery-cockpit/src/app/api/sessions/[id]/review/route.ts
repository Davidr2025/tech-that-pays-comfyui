import { guardSession } from "@/server/auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, readBody } from "@/lib/api";
import { buildClientReview } from "@/server/review";

const body = z.object({ upTo: z.number().int().positive().optional() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const denied = await guardSession(req, id);
  if (denied) return denied;
  const parsed = await readBody(req, body);
  if ("error" in parsed) return parsed.error;
  try {
    const { revealPath, prototypePath } = await buildClientReview(id, { upTo: parsed.data.upTo });
    return NextResponse.json({ revealPath, prototypePath });
  } catch (err) {
    return errorResponse(err, "Could not build the client review.");
  }
}
