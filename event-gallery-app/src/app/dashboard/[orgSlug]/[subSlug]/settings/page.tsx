import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSubAccountRole } from "@/lib/authz";
import { db } from "@/lib/db";
import { limitsForOrg } from "@/lib/plan";
import { updateSubAccountSettingsAction, disconnectExternalStorageAction } from "@/lib/actions/sub-accounts";

export default async function SubAccountSettingsPage({
  params,
  searchParams,
}: {
  params: { orgSlug: string; subSlug: string };
  searchParams: { error?: string; success?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const subAccount = await db.subAccount.findFirst({
    where: { slug: params.subSlug, organization: { slug: params.orgSlug } },
    include: { organization: true },
  });
  if (!subAccount) notFound();

  const role = await getSubAccountRole(user.id, subAccount.id);
  if (!role) notFound();

  const whiteLabelAllowed = limitsForOrg(subAccount.organization).whiteLabelAllowed;
  const externalStorageAllowed = limitsForOrg(subAccount.organization).externalStorageSyncAllowed;
  const driveConnection = await db.externalStorageConnection.findUnique({
    where: { subAccountId_provider: { subAccountId: subAccount.id, provider: "GOOGLE_DRIVE" } },
  });

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-2xl font-bold">{subAccount.name} settings</h1>

      {searchParams.error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{searchParams.error}</p>
      )}
      {searchParams.success && (
        <p className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">Settings saved.</p>
      )}

      <form action={updateSubAccountSettingsAction} className="space-y-4">
        <input type="hidden" name="orgSlug" value={params.orgSlug} />
        <input type="hidden" name="subSlug" value={params.subSlug} />

        <div>
          <label className="mb-1 block text-sm opacity-70">Brand color</label>
          <input
            name="brandColor"
            type="color"
            defaultValue={subAccount.brandColor ?? "#8b5cf6"}
            className="h-10 w-20 rounded border border-neutral-300 dark:border-neutral-700"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm opacity-70">
            Custom domain (white-label — Agency plan)
          </label>
          <input
            name="customDomain"
            placeholder="events.yourclientdomain.com"
            defaultValue={subAccount.customDomain ?? ""}
            disabled={!whiteLabelAllowed}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900"
          />
          {!whiteLabelAllowed ? (
            <p className="mt-1 text-xs text-amber-600">
              Upgrade to the Agency plan in Billing to connect a custom domain.
            </p>
          ) : (
            <p className="mt-1 text-xs opacity-60">
              Point this domain's DNS at your hosting provider (e.g. a CNAME to your Vercel
              deployment) and add it there as a custom domain — that part happens outside this
              app. Once DNS resolves here, visiting the domain's root will redirect to this
              business's current live event.
            </p>
          )}
        </div>

        <div className="border-t border-neutral-200 pt-4 dark:border-neutral-800">
          <p className="mb-3 text-sm font-semibold">Guest contact capture &amp; reviews</p>

          <label className="mb-1 block text-sm opacity-70">Google review link</label>
          <input
            name="googleReviewUrl"
            placeholder="https://g.page/r/your-business/review"
            defaultValue={subAccount.googleReviewUrl ?? ""}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <p className="mb-3 mt-1 text-xs opacity-60">
            Find this in your Google Business Profile under "Ask for reviews." Shown to guests
            right after they upload a photo.
          </p>

          <label className="mb-1 block text-sm opacity-70">Contact capture incentive message</label>
          <textarea
            name="contactIncentiveMessage"
            placeholder="Enter your email or phone for a free dessert on your next visit!"
            defaultValue={subAccount.contactIncentiveMessage ?? ""}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <p className="mb-3 mt-1 text-xs opacity-60">
            Shown on the card that asks guests for their email/phone after their first upload.
          </p>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="requireContactInfo"
              defaultChecked={subAccount.requireContactInfo}
            />
            Require contact info (hides the Skip option — off by default, recommended)
          </label>
        </div>

        <button className="w-full rounded-lg bg-brand-600 py-2 font-semibold text-white hover:bg-brand-700">
          Save
        </button>
      </form>

      <div className="mt-10 border-t border-neutral-200 pt-6 dark:border-neutral-800">
        <h2 className="mb-2 text-lg font-semibold">Google Drive export</h2>
        <p className="mb-3 text-sm opacity-60">
          Automatically export approved uploads into a Drive folder as a permanent backup, on top
          of storage in this app.
        </p>

        {!externalStorageAllowed ? (
          <p className="text-xs text-amber-600">
            Upgrade to the Pro plan or higher in Billing to connect external storage.
          </p>
        ) : driveConnection ? (
          <div className="flex items-center justify-between rounded-lg bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-900">
            <span>Connected as {driveConnection.connectedEmail ?? "Google account"}</span>
            <form action={disconnectExternalStorageAction}>
              <input type="hidden" name="orgSlug" value={params.orgSlug} />
              <input type="hidden" name="subSlug" value={params.subSlug} />
              <button className="text-red-600 underline">Disconnect</button>
            </form>
          </div>
        ) : (
          <a
            href={`/api/integrations/google-drive/start?subAccountId=${subAccount.id}`}
            className="inline-block rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            Connect Google Drive
          </a>
        )}
      </div>
    </div>
  );
}
