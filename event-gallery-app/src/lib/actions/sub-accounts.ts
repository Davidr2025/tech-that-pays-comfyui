"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getOrganizationRole } from "@/lib/authz";
import { slugify } from "@/lib/events";

export async function createSubAccountAction(formData: FormData) {
  const user = await requireUser();
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const brandColor = String(formData.get("brandColor") ?? "").trim() || null;

  const org = await db.organization.findUnique({ where: { slug: orgSlug } });
  if (!org) redirect("/dashboard");

  const role = await getOrganizationRole(user.id, org.id);
  if (!role || (role !== "OWNER" && role !== "ADMIN")) {
    redirect(`/dashboard/${orgSlug}?error=You+don%27t+have+permission+to+add+businesses`);
  }
  if (!name) {
    redirect(`/dashboard/${orgSlug}/sub-accounts/new?error=Name+is+required`);
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
