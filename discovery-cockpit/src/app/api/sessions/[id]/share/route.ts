import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { getShareKit } from "@/server/share";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    return NextResponse.json(await getShareKit(id));
  } catch (err) {
    return errorResponse(err);
  }
}
