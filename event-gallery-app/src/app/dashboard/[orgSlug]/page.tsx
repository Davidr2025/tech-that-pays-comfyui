import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getOrganizationRole } from "@/lib/authz";
import { db } from "@/lib/db";
import { PLAN_LIMITS } from "@/lib/plan";

export default async function OrganizationPage({ params }: { params: { orgSlug: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const org = await db.organization.findUnique({
    where: { slug: params.orgSlug },
    include: { subAccounts: { orderBy: { createdAt: "desc" } } },
  });
  if (!org) notFound();

  const role = await getOrganizationRole(user.id, org.id);
  if (!role) notFound();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm opacity-60">Organization · {PLAN_LIMITS[org.planTier].label} plan</p>
          <h1 className="text-2xl font-bold">{org.name}</h1>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/dashboard/${org.slug}/billing`}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            Billing
          </Link>
          <Link
            href={`/dashboard/${org.slug}/sub-accounts/new`}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            + Add business
          </Link>
        </div>
      </div>

      {org.subAccounts.length === 0 ? (
        <p className="text-neutral-600 dark:text-neutral-400">
          No businesses yet. Each business (venue, client, brand) gets its own events and social connections.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {org.subAccounts.map((sa) => (
            <li key={sa.id}>
              <Link
                href={`/dashboard/${org.slug}/${sa.slug}`}
                className="block rounded-xl border border-neutral-200 bg-white p-5 hover:border-brand-400 dark:border-neutral-800 dark:bg-neutral-900"
              >
                <p className="font-semibold">{sa.name}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
