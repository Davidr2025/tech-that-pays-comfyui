"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getOrganizationRole } from "@/lib/authz";
import { stripe } from "@/lib/stripe";

async function requireOrgOwner(userId: string, orgSlug: string) {
  const org = await db.organization.findUnique({ where: { slug: orgSlug } });
  if (!org) redirect("/dashboard");

  const role = await getOrganizationRole(userId, org.id);
  if (role !== "OWNER" && role !== "ADMIN") {
    redirect(`/dashboard/${orgSlug}?error=Only+org+owners+can+manage+billing`);
  }
  return org;
}

export async function createCheckoutSessionAction(formData: FormData) {
  const user = await requireUser();
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const priceId = String(formData.get("priceId") ?? "");
  const org = await requireOrgOwner(user.id, orgSlug);

  const appBaseUrl = process.env.APP_BASE_URL?.replace(/\/$/, "");

  let customerId = org.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: org.name,
      metadata: { organizationId: org.id },
    });
    customerId = customer.id;
    await db.organization.update({ where: { id: org.id }, data: { stripeCustomerId: customerId } });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appBaseUrl}/dashboard/${orgSlug}/billing?success=1`,
    cancel_url: `${appBaseUrl}/dashboard/${orgSlug}/billing?canceled=1`,
    metadata: { organizationId: org.id },
    subscription_data: { metadata: { organizationId: org.id } },
  });

  if (!session.url) redirect(`/dashboard/${orgSlug}/billing?error=Could+not+start+checkout`);
  redirect(session.url);
}

export async function createBillingPortalSessionAction(formData: FormData) {
  const user = await requireUser();
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const org = await requireOrgOwner(user.id, orgSlug);

  if (!org.stripeCustomerId) {
    redirect(`/dashboard/${orgSlug}/billing?error=No+billing+account+yet`);
  }

  const appBaseUrl = process.env.APP_BASE_URL?.replace(/\/$/, "");
  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: `${appBaseUrl}/dashboard/${orgSlug}/billing`,
  });

  redirect(session.url);
}
