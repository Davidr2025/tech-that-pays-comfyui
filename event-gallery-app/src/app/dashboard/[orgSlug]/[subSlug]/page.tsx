import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSubAccountRole } from "@/lib/authz";
import { db } from "@/lib/db";

export default async function SubAccountPage({
  params,
}: {
  params: { orgSlug: string; subSlug: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const subAccount = await db.subAccount.findFirst({
    where: { slug: params.subSlug, organization: { slug: params.orgSlug } },
    include: { events: { orderBy: { eventDate: "desc" } } },
  });
  if (!subAccount) notFound();

  const role = await getSubAccountRole(user.id, subAccount.id);
  if (!role) notFound();

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm opacity-60">Business</p>
          <h1 className="text-2xl font-bold">{subAccount.name}</h1>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/dashboard/${params.orgSlug}/${params.subSlug}/connections`}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            Social connections
          </Link>
          <Link
            href={`/dashboard/${params.orgSlug}/${params.subSlug}/events/new`}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            + New event
          </Link>
        </div>
      </div>

      {subAccount.events.length === 0 ? (
        <p className="text-neutral-600 dark:text-neutral-400">No events yet.</p>
      ) : (
        <ul className="space-y-2">
          {subAccount.events.map((event) => (
            <li key={event.id}>
              <Link
                href={`/dashboard/${params.orgSlug}/${params.subSlug}/events/${event.slug}`}
                className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-4 hover:border-brand-400 dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div>
                  <p className="font-semibold">{event.name}</p>
                  <p className="text-sm opacity-60">
                    {new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(event.eventDate)}
                    {event.location ? ` · ${event.location}` : ""}
                  </p>
                </div>
                {event.expiresAt && event.expiresAt < new Date() ? (
                  <span className="rounded-full bg-neutral-200 px-3 py-1 text-xs dark:bg-neutral-800">
                    Expired
                  </span>
                ) : (
                  <span className="rounded-full bg-green-100 px-3 py-1 text-xs text-green-700">Live</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
