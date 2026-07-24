import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getOrganizationRole } from "@/lib/authz";
import { db } from "@/lib/db";
import { PLAN_LIMITS } from "@/lib/plan";
import { createCheckoutSessionAction, createBillingPortalSessionAction } from "@/lib/actions/billing";

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: { orgSlug: string };
  searchParams: { success?: string; canceled?: string; error?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const org = await db.organization.findUnique({ where: { slug: params.orgSlug } });
  if (!org) notFound();

  const role = await getOrganizationRole(user.id, org.id);
  if (!role) notFound();

  const proPriceId = process.env.STRIPE_PRICE_PRO;
  const agencyPriceId = process.env.STRIPE_PRICE_AGENCY;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-2xl font-bold">Billing</h1>
      <p className="mb-6 text-sm opacity-60">
        Current plan: <strong>{PLAN_LIMITS[org.planTier].label}</strong>
        {org.stripeCancelAtPeriodEnd && org.stripeCurrentPeriodEnd
          ? ` (cancels ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(org.stripeCurrentPeriodEnd)})`
          : ""}
      </p>

      {searchParams.success && (
        <p className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          Subscription updated — this may take a few seconds to reflect below.
        </p>
      )}
      {searchParams.error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{searchParams.error}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {(Object.keys(PLAN_LIMITS) as Array<keyof typeof PLAN_LIMITS>).map((tier) => {
          const limits = PLAN_LIMITS[tier];
          const priceId = tier === "PRO" ? proPriceId : tier === "AGENCY" ? agencyPriceId : null;
          const isCurrent = org.planTier === tier;

          return (
            <div
              key={tier}
              className={`rounded-xl border p-5 ${isCurrent ? "border-brand-500" : "border-neutral-200 dark:border-neutral-800"}`}
            >
              <p className="font-semibold">{limits.label}</p>
              <ul className="mt-2 space-y-1 text-xs opacity-70">
                <li>{limits.maxSubAccounts === Infinity ? "Unlimited" : limits.maxSubAccounts} businesses</li>
                <li>{limits.permanentStorageAllowed ? "Permanent storage" : "14-day storage"}</li>
                <li>{limits.externalStorageSyncAllowed ? "Drive/Dropbox sync" : "No external sync"}</li>
                <li>{limits.whiteLabelAllowed ? "White-label domains" : "No white-label"}</li>
              </ul>

              {isCurrent ? (
                <p className="mt-4 text-xs font-semibold text-brand-600">Current plan</p>
              ) : priceId ? (
                <form action={createCheckoutSessionAction} className="mt-4">
                  <input type="hidden" name="orgSlug" value={params.orgSlug} />
                  <input type="hidden" name="priceId" value={priceId} />
                  <button className="w-full rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                    Upgrade
                  </button>
                </form>
              ) : tier === "FREE" ? (
                <p className="mt-4 text-xs opacity-60">Default plan</p>
              ) : (
                <p className="mt-4 text-xs text-red-600">Price not configured</p>
              )}
            </div>
          );
        })}
      </div>

      {org.stripeCustomerId && (
        <form action={createBillingPortalSessionAction} className="mt-6">
          <input type="hidden" name="orgSlug" value={params.orgSlug} />
          <button className="text-sm underline opacity-70 hover:opacity-100">
            Manage billing / payment method / invoices
          </button>
        </form>
      )}
    </div>
  );
}
