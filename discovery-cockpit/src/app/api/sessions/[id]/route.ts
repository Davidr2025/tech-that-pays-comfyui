import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, readBody } from "@/lib/api";
import { setBrandingMode } from "@/server/sessions";

const body = z.object({ brandingMode: z.enum(["CONSULTANT", "CLIENT"]) });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await readBody(req, body);
  if ("error" in parsed) return parsed.error;
  try {
    await setBrandingMode(id, parsed.data.brandingMode);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
