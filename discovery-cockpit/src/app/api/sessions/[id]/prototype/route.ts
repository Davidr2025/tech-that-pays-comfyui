import { NextResponse } from "next/server";
import { errorResponse, readBody } from "@/lib/api";
import { editSchema } from "@/lib/prototype/edit";
import { guardSession } from "@/server/auth";
import { editPrototype } from "@/server/prototype-edit";

/** The signed-in owner changes their prototype: approve a draft, enter figures, add an alert or contact. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const denied = await guardSession(req, id);
  if (denied) return denied;
  const parsed = await readBody(req, editSchema);
  if ("error" in parsed) return parsed.error;
  try {
    return NextResponse.json({ module: await editPrototype(id, parsed.data) });
  } catch (err) {
    return errorResponse(err, "Could not save that change.");
  }
}
