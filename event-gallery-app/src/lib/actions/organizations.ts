"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { slugify } from "@/lib/events";

export async function createOrganizationAction(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/dashboard/orgs/new?error=Name+is+required");

  const baseSlug = slugify(name) || "org";
  let slug = baseSlug;
  let attempt = 1;
  while (await db.organization.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${++attempt}`;
  }

  const org = await db.organization.create({
    data: {
      name,
      slug,
      memberships: {
        create: { userId: user.id, role: "OWNER" },
      },
    },
  });

  redirect(`/dashboard/${org.slug}`);
}
