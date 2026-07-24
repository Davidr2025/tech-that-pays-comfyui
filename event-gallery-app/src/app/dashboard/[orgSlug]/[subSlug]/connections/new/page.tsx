import { createSocialConnectionAction } from "@/lib/actions/connections";

export default function NewConnectionPage({
  params,
  searchParams,
}: {
  params: { orgSlug: string; subSlug: string };
  searchParams: { error?: string; provider?: string };
}) {
  const provider = searchParams.provider === "GHL" ? "GHL" : "BLOTATO";

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-2xl font-bold">Connect a social provider</h1>
      {searchParams.error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{searchParams.error}</p>
      )}

      <div className="mb-4 flex gap-2 text-sm">
        <a
          href="?provider=BLOTATO"
          className={`rounded-lg px-3 py-1.5 ${provider === "BLOTATO" ? "bg-brand-600 text-white" : "border border-neutral-300 dark:border-neutral-700"}`}
        >
          Blotato
        </a>
        <a
          href="?provider=GHL"
          className={`rounded-lg px-3 py-1.5 ${provider === "GHL" ? "bg-brand-600 text-white" : "border border-neutral-300 dark:border-neutral-700"}`}
        >
          GoHighLevel
        </a>
      </div>

      <form action={createSocialConnectionAction} className="space-y-4">
        <input type="hidden" name="orgSlug" value={params.orgSlug} />
        <input type="hidden" name="subSlug" value={params.subSlug} />
        <input type="hidden" name="provider" value={provider} />

        <input
          name="label"
          required
          placeholder="Label (e.g. Main Instagram)"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        />

        {provider === "BLOTATO" ? (
          <>
            <input
              name="apiKey"
              required
              placeholder="Blotato API key"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            />
            <input
              name="accountId"
              required
              placeholder="Blotato account ID (from GET /v2/users/me/accounts)"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            />
          </>
        ) : (
          <>
            <input
              name="accessToken"
              required
              placeholder="GHL private integration / access token"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            />
            <input
              name="locationId"
              required
              placeholder="GHL location ID"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            />
            <input
              name="accountIds"
              required
              placeholder="GHL social account ID(s), comma-separated"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            />
          </>
        )}

        <button className="w-full rounded-lg bg-brand-600 py-2 font-semibold text-white hover:bg-brand-700">
          Connect
        </button>
      </form>
    </div>
  );
}
