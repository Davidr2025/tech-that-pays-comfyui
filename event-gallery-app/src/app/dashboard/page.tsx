import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function DashboardHome() {
  const user = await getCurrentUser();
  if (!user) return null; // layout already redirects

  const memberships = await db.membership.findMany({
    where: { userId: user.id },
    include: { organization: true },
    distinct: ["organizationId"],
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your organizations</h1>
        <Link
          href="/dashboard/orgs/new"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          + New organization
        </Link>
      </div>

      {memberships.length === 0 ? (
        <p className="text-neutral-600 dark:text-neutral-400">
          You're not part of an organization yet. Create one to start adding businesses and events.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {memberships.map((m) => (
            <li key={m.organizationId}>
              <Link
                href={`/dashboard/${m.organization.slug}`}
                className="block rounded-xl border border-neutral-200 bg-white p-5 hover:border-brand-400 dark:border-neutral-800 dark:bg-neutral-900"
              >
                <p className="font-semibold">{m.organization.name}</p>
                <p className="text-sm opacity-60">Role: {m.role}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
