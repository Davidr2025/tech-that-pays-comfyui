import { guardSession } from "@/server/auth";
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { getShareKit } from "@/server/share";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const denied = await guardSession(req, id);
  if (denied) return denied;
  try {
    return NextResponse.json(await getShareKit(id));
  } catch (err) {
    return errorResponse(err);
  }
}
