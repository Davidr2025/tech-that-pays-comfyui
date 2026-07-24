"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requireSubAccountRole } from "@/lib/authz";
import { slugify, computeExpiresAt } from "@/lib/events";
import { generateAndStoreEventQrCode } from "@/lib/qrcode";
import type { EventTheme } from "@prisma/client";

async function findSubAccount(orgSlug: string, subSlug: string) {
  const subAccount = await db.subAccount.findFirst({
    where: { slug: subSlug, organization: { slug: orgSlug } },
  });
  if (!subAccount) redirect("/dashboard");
  return subAccount;
}

export async function createEventAction(formData: FormData) {
  const user = await requireUser();
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const subSlug = String(formData.get("subSlug") ?? "");
  const subAccount = await findSubAccount(orgSlug, subSlug);

  await requireSubAccountRole(user.id, subAccount.id, "STAFF");

  const name = String(formData.get("name") ?? "").trim();
  const eventDateRaw = String(formData.get("eventDate") ?? "");
  const location = String(formData.get("location") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim() || null;
  const theme = (String(formData.get("theme") ?? "CLASSIC") as EventTheme) ?? "CLASSIC";
  const permanentStorage = formData.get("permanentStorage") === "on";

  if (!name || !eventDateRaw) {
    redirect(`/dashboard/${orgSlug}/${subSlug}/events/new?error=Name+and+date+are+required`);
  }

  const eventDate = new Date(eventDateRaw);
  const baseSlug = slugify(`${subAccount.slug}-${name}`) || "event";
  let slug = baseSlug;
  let attempt = 1;
  while (await db.event.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${++attempt}`;
  }

  const event = await db.event.create({
    data: {
      subAccountId: subAccount.id,
      name,
      slug,
      eventDate,
      location,
      description,
      theme,
      permanentStorage,
      expiresAt: computeExpiresAt(eventDate, permanentStorage),
    },
  });

  try {
    const qrCodeStorageKey = await generateAndStoreEventQrCode(event.id, event.slug);
    await db.event.update({ where: { id: event.id }, data: { qrCodeStorageKey } });
  } catch {
    // QR generation needs object storage credentials configured; the event
    // still works via its direct link if this fails in local dev.
  }

  redirect(`/dashboard/${orgSlug}/${subSlug}/events/${event.slug}`);
}

export async function setMediaStatusAction(formData: FormData) {
  const user = await requireUser();
  const mediaId = String(formData.get("mediaId") ?? "");
  const status = String(formData.get("status") ?? "") as "APPROVED" | "REJECTED";
  const redirectTo = String(formData.get("redirectTo") ?? "/dashboard");

  const media = await db.mediaAsset.findUnique({
    where: { id: mediaId },
    include: { event: { include: { subAccount: true } } },
  });
  if (!media) redirect(redirectTo);

  await requireSubAccountRole(user.id, media.event.subAccountId, "STAFF");
  await db.mediaAsset.update({ where: { id: mediaId }, data: { status } });

  redirect(redirectTo);
}
