import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requireSubAccountRole } from "@/lib/authz";
import { decodeGoogleDriveState, exchangeGoogleDriveCode } from "@/lib/google-drive";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state) {
    return NextResponse.json({ error: "Missing code/state from Google" }, { status: 400 });
  }

  const { subAccountId } = decodeGoogleDriveState(state);
  const subAccount = await db.subAccount.findUnique({
    where: { id: subAccountId },
    include: { organization: true },
  });
  if (!subAccount) {
    return NextResponse.json({ error: "Sub-account not found" }, { status: 404 });
  }
  await requireSubAccountRole(user.id, subAccount.id, "ADMIN");

  const settingsUrl = new URL(
    `/dashboard/${subAccount.organization.slug}/${subAccount.slug}/settings`,
    req.url,
  );

  try {
    const { refreshToken, email } = await exchangeGoogleDriveCode(code);

    await db.externalStorageConnection.upsert({
      where: { subAccountId_provider: { subAccountId: subAccount.id, provider: "GOOGLE_DRIVE" } },
      create: {
        subAccountId: subAccount.id,
        provider: "GOOGLE_DRIVE",
        refreshToken,
        connectedEmail: email,
      },
      update: { refreshToken, connectedEmail: email },
    });

    settingsUrl.searchParams.set("success", "1");
    return NextResponse.redirect(settingsUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not connect Google Drive";
    settingsUrl.searchParams.set("error", message);
    return NextResponse.redirect(settingsUrl);
  }
}
