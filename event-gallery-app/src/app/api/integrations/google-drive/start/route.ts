import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requireSubAccountRole } from "@/lib/authz";
import { limitsForOrg } from "@/lib/plan";
import { buildGoogleDriveAuthUrl } from "@/lib/google-drive";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const subAccountId = req.nextUrl.searchParams.get("subAccountId") ?? "";
  const subAccount = await db.subAccount.findUnique({
    where: { id: subAccountId },
    include: { organization: true },
  });
  if (!subAccount) {
    return NextResponse.json({ error: "Sub-account not found" }, { status: 404 });
  }

  await requireSubAccountRole(user.id, subAccount.id, "ADMIN");

  if (!limitsForOrg(subAccount.organization).externalStorageSyncAllowed) {
    return NextResponse.redirect(
      new URL(
        `/dashboard/${subAccount.organization.slug}/${subAccount.slug}/settings?error=External+storage+sync+needs+the+Pro+plan+or+higher`,
        req.url,
      ),
    );
  }

  if (!process.env.GOOGLE_OAUTH_CLIENT_ID) {
    return NextResponse.json(
      { error: "Google Drive integration is not configured on this deployment yet" },
      { status: 501 },
    );
  }

  return NextResponse.redirect(buildGoogleDriveAuthUrl(subAccount.id));
}
