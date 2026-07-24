import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSubAccountRole } from "@/lib/authz";
import { db } from "@/lib/db";
import { deleteSocialConnectionAction } from "@/lib/actions/connections";

export default async function ConnectionsPage({
  params,
}: {
  params: { orgSlug: string; subSlug: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const subAccount = await db.subAccount.findFirst({
    where: { slug: params.subSlug, organization: { slug: params.orgSlug } },
    include: { socialConnections: { orderBy: { createdAt: "desc" } } },
  });
  if (!subAccount) notFound();

  const role = await getSubAccountRole(user.id, subAccount.id);
  if (!role) notFound();

  const redirectTo = `/dashboard/${params.orgSlug}/${params.subSlug}/connections`;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Social connections</h1>
        <Link
          href={`/dashboard/${params.orgSlug}/${params.subSlug}/connections/new`}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          + Connect Blotato or GHL
        </Link>
      </div>

      {subAccount.socialConnections.length === 0 ? (
        <p className="text-sm opacity-60">
          No connections yet. Add a Blotato or GHL connection to publish gallery media straight to social.
        </p>
      ) : (
        <ul className="space-y-2">
          {subAccount.socialConnections.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div>
                <p className="font-semibold">{c.label}</p>
                <p className="text-sm opacity-60">{c.provider}</p>
              </div>
              <form action={deleteSocialConnectionAction}>
                <input type="hidden" name="connectionId" value={c.id} />
                <input type="hidden" name="redirectTo" value={redirectTo} />
                <button className="text-sm text-red-600 underline">Remove</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
