import { guardSession } from "@/server/auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, readBody } from "@/lib/api";
import { setBrandingMode, setInternalNotes } from "@/server/sessions";

const body = z
  .object({ brandingMode: z.enum(["CONSULTANT", "CLIENT"]).optional(), internalNotes: z.string().nullable().optional() })
  .strict()
  .refine((b) => Object.keys(b).length > 0, "Nothing to change.");

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const denied = await guardSession(req, id);
  if (denied) return denied;
  const parsed = await readBody(req, body);
  if ("error" in parsed) return parsed.error;
  try {
    if (parsed.data.brandingMode !== undefined) await setBrandingMode(id, parsed.data.brandingMode);
    if (parsed.data.internalNotes !== undefined) await setInternalNotes(id, parsed.data.internalNotes);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
