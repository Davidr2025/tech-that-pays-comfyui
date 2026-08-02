import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requireSubAccountRole } from "@/lib/authz";

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/**
 * CSV export of captured guests — the bridge for pushing contacts into GHL
 * (or any CRM) manually until automatic GHL contact sync is built.
 */
export async function GET(_req: NextRequest, { params }: { params: { subAccountId: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await requireSubAccountRole(user.id, params.subAccountId, "STAFF");

  const guests = await db.guest.findMany({
    where: { subAccountId: params.subAccountId },
    include: { event: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  const header = ["Name", "Email", "Phone", "Email consent", "SMS consent", "Event", "Captured at"];
  const rows = guests.map((g) =>
    [
      g.name ?? "",
      g.email ?? "",
      g.phone ?? "",
      g.emailConsent ? "yes" : "no",
      g.smsConsent ? "yes" : "no",
      g.event?.name ?? "",
      g.createdAt.toISOString(),
    ]
      .map(csvEscape)
      .join(","),
  );

  const csv = [header.join(","), ...rows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="guests.csv"`,
    },
  });
}
