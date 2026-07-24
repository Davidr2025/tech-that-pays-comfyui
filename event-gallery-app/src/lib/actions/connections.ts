"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requireSubAccountRole } from "@/lib/authz";
import type { SocialProvider } from "@prisma/client";

async function findSubAccount(orgSlug: string, subSlug: string) {
  const subAccount = await db.subAccount.findFirst({
    where: { slug: subSlug, organization: { slug: orgSlug } },
  });
  if (!subAccount) redirect("/dashboard");
  return subAccount;
}

/**
 * Stores provider credentials for a sub-account. In production, encrypt
 * credentialsJson at rest (e.g. via KMS envelope encryption) before persisting.
 */
export async function createSocialConnectionAction(formData: FormData) {
  const user = await requireUser();
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const subSlug = String(formData.get("subSlug") ?? "");
  const subAccount = await findSubAccount(orgSlug, subSlug);
  await requireSubAccountRole(user.id, subAccount.id, "ADMIN");

  const provider = String(formData.get("provider") ?? "") as SocialProvider;
  const label = String(formData.get("label") ?? "").trim();

  let credentials: Record<string, unknown>;
  if (provider === "BLOTATO") {
    credentials = {
      apiKey: String(formData.get("apiKey") ?? "").trim(),
      accountId: String(formData.get("accountId") ?? "").trim(),
    };
  } else {
    credentials = {
      accessToken: String(formData.get("accessToken") ?? "").trim(),
      locationId: String(formData.get("locationId") ?? "").trim(),
      accountIds: String(formData.get("accountIds") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };
  }

  if (!label || !provider) {
    redirect(`/dashboard/${orgSlug}/${subSlug}/connections/new?error=Missing+required+fields`);
  }

  await db.socialConnection.create({
    data: {
      subAccountId: subAccount.id,
      provider,
      label,
      credentialsJson: JSON.stringify(credentials),
    },
  });

  redirect(`/dashboard/${orgSlug}/${subSlug}/connections`);
}

export async function deleteSocialConnectionAction(formData: FormData) {
  const user = await requireUser();
  const connectionId = String(formData.get("connectionId") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? "/dashboard");

  const connection = await db.socialConnection.findUnique({ where: { id: connectionId } });
  if (!connection) redirect(redirectTo);

  await requireSubAccountRole(user.id, connection.subAccountId, "ADMIN");
  await db.socialConnection.delete({ where: { id: connectionId } });

  redirect(redirectTo);
}
