import { createSubAccountAction } from "@/lib/actions/sub-accounts";

export default function NewSubAccountPage({
  params,
  searchParams,
}: {
  params: { orgSlug: string };
  searchParams: { error?: string };
}) {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-2xl font-bold">Add a business</h1>
      {searchParams.error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{searchParams.error}</p>
      )}
      <form action={createSubAccountAction} className="space-y-4">
        <input type="hidden" name="orgSlug" value={params.orgSlug} />
        <input
          name="name"
          required
          placeholder="Business name"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <div>
          <label className="mb-1 block text-sm opacity-70">Brand color (optional)</label>
          <input
            name="brandColor"
            type="color"
            defaultValue="#8b5cf6"
            className="h-10 w-20 rounded border border-neutral-300 dark:border-neutral-700"
          />
        </div>
        <button className="w-full rounded-lg bg-brand-600 py-2 font-semibold text-white hover:bg-brand-700">
          Create business
        </button>
      </form>
    </div>
  );
}
