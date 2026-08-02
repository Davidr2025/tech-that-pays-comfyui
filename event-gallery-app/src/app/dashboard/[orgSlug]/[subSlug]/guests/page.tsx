import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSubAccountRole } from "@/lib/authz";
import { db } from "@/lib/db";

export default async function GuestsPage({
  params,
}: {
  params: { orgSlug: string; subSlug: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const subAccount = await db.subAccount.findFirst({
    where: { slug: params.subSlug, organization: { slug: params.orgSlug } },
  });
  if (!subAccount) notFound();

  const role = await getSubAccountRole(user.id, subAccount.id);
  if (!role) notFound();

  const guests = await db.guest.findMany({
    where: { subAccountId: subAccount.id },
    include: { event: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Guests</h1>
        <a
          href={`/api/sub-accounts/${subAccount.id}/guests-export`}
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          Export CSV
        </a>
      </div>

      <p className="mb-6 text-sm opacity-60">
        Contacts captured at upload time. Not yet synced to GHL automatically — export as CSV to
        import into GHL or any CRM in the meantime.
      </p>

      {guests.length === 0 ? (
        <p className="text-sm opacity-60">No contacts captured yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-100 dark:bg-neutral-900">
              <tr>
                <th className="px-3 py-2">Contact</th>
                <th className="px-3 py-2">Consent</th>
                <th className="px-3 py-2">Event</th>
                <th className="px-3 py-2">Captured</th>
              </tr>
            </thead>
            <tbody>
              {guests.map((g) => (
                <tr key={g.id} className="border-t border-neutral-200 dark:border-neutral-800">
                  <td className="px-3 py-2">
                    {g.name && <div className="font-medium">{g.name}</div>}
                    {g.email && <div>{g.email}</div>}
                    {g.phone && <div>{g.phone}</div>}
                  </td>
                  <td className="px-3 py-2 text-xs opacity-70">
                    {g.emailConsent && <div>Email ✓</div>}
                    {g.smsConsent && <div>SMS ✓</div>}
                    {!g.emailConsent && !g.smsConsent && "—"}
                  </td>
                  <td className="px-3 py-2 opacity-70">{g.event?.name ?? "—"}</td>
                  <td className="px-3 py-2 opacity-70">
                    {new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(g.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
