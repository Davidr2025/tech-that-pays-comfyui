import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, readBody } from "@/lib/api";
import { buildClientReview, ReviewError } from "@/server/review";

const body = z.object({ upTo: z.number().int().positive().optional() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await readBody(req, body);
  if ("error" in parsed) return parsed.error;
  try {
    const { revealPath } = await buildClientReview(id, { upTo: parsed.data.upTo });
    return NextResponse.json({ revealPath });
  } catch (err) {
    if (err instanceof ReviewError) return jsonError(err.message, err.code === "NOT_FOUND" ? 404 : 400);
    console.error(err);
    return jsonError("Could not build the client review.", 500);
  }
}
