import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const [consultants, sessions] = await Promise.all([prisma.consultant.count(), prisma.session.count()]);
    return NextResponse.json({ ok: true, database: "up", consultants, sessions });
  } catch (err) {
    return NextResponse.json({ ok: false, database: "down", error: err instanceof Error ? err.message : "unknown" }, { status: 503 });
  }
}
