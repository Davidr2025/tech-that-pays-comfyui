"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getOrganizationRole, requireSubAccountRole } from "@/lib/authz";
import { slugify } from "@/lib/events";
import { canAddSubAccount, limitsForOrg } from "@/lib/plan";

export async function createSubAccountAction(formData: FormData) {
  const user = await requireUser();
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const brandColor = String(formData.get("brandColor") ?? "").trim() || null;

  const org = await db.organization.findUnique({
    where: { slug: orgSlug },
    include: { _count: { select: { subAccounts: true } } },
  });
  if (!org) redirect("/dashboard");

  const role = await getOrganizationRole(user.id, org.id);
  if (!role || (role !== "OWNER" && role !== "ADMIN")) {
    redirect(`/dashboard/${orgSlug}?error=You+don%27t+have+permission+to+add+businesses`);
  }
  if (!name) {
    redirect(`/dashboard/${orgSlug}/sub-accounts/new?error=Name+is+required`);
  }
  if (!canAddSubAccount(org, org._count.subAccounts)) {
    redirect(
      `/dashboard/${orgSlug}/sub-accounts/new?error=Business+limit+reached+for+your+plan+%E2%80%94+see+Billing+to+upgrade`,
    );
  }

  const baseSlug = slugify(name) || "business";
  let slug = baseSlug;
  let attempt = 1;
  while (await db.subAccount.findUnique({ where: { organizationId_slug: { organizationId: org.id, slug } } })) {
    slug = `${baseSlug}-${++attempt}`;
  }

  const subAccount = await db.subAccount.create({
    data: { organizationId: org.id, name, slug, brandColor },
  });

  redirect(`/dashboard/${orgSlug}/${subAccount.slug}`);
}

export async function updateSubAccountSettingsAction(formData: FormData) {
  const user = await requireUser();
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const subSlug = String(formData.get("subSlug") ?? "");
  const redirectTo = `/dashboard/${orgSlug}/${subSlug}/settings`;

  const subAccount = await db.subAccount.findFirst({
    where: { slug: subSlug, organization: { slug: orgSlug } },
    include: { organization: true },
  });
  if (!subAccount) redirect("/dashboard");

  await requireSubAccountRole(user.id, subAccount.id, "ADMIN");

  const brandColor = String(formData.get("brandColor") ?? "").trim() || null;
  const customDomainRaw = String(formData.get("customDomain") ?? "").trim().toLowerCase();
  const customDomain = customDomainRaw || null;

  if (customDomain && !limitsForOrg(subAccount.organization).whiteLabelAllowed) {
    redirect(`${redirectTo}?error=White-label+domains+need+the+Agency+plan+%E2%80%94+see+Billing`);
  }
  if (customDomain && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(customDomain)) {
    redirect(`${redirectTo}?error=That+doesn%27t+look+like+a+valid+domain`);
  }

  try {
    await db.subAccount.update({
      where: { id: subAccount.id },
      data: { brandColor, customDomain },
    });
  } catch (err: unknown) {
    if (typeof err === "object" && err !== null && "code" in err && err.code === "P2002") {
      redirect(`${redirectTo}?error=That+domain+is+already+connected+to+another+business`);
    }
    throw err;
  }

  redirect(`${redirectTo}?success=1`);
}

export async function disconnectExternalStorageAction(formData: FormData) {
  const user = await requireUser();
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const subSlug = String(formData.get("subSlug") ?? "");
  const redirectTo = `/dashboard/${orgSlug}/${subSlug}/settings`;

  const subAccount = await db.subAccount.findFirst({
    where: { slug: subSlug, organization: { slug: orgSlug } },
  });
  if (!subAccount) redirect("/dashboard");

  await requireSubAccountRole(user.id, subAccount.id, "ADMIN");

  await db.externalStorageConnection.deleteMany({
    where: { subAccountId: subAccount.id, provider: "GOOGLE_DRIVE" },
  });

  redirect(redirectTo);
}
