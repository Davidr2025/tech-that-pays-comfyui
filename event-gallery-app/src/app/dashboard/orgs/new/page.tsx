import { createOrganizationAction } from "@/lib/actions/organizations";

export default function NewOrganizationPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-2xl font-bold">New organization</h1>
      {searchParams.error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{searchParams.error}</p>
      )}
      <form action={createOrganizationAction} className="space-y-4">
        <input
          name="name"
          required
          placeholder="Organization name (e.g. your agency name)"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button className="w-full rounded-lg bg-brand-600 py-2 font-semibold text-white hover:bg-brand-700">
          Create
        </button>
      </form>
    </div>
  );
}
