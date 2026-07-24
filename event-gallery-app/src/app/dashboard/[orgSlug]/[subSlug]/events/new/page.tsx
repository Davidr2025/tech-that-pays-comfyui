import { createEventAction } from "@/lib/actions/events";

const THEMES = ["CLASSIC", "MODERN", "PLAYFUL", "ELEGANT"] as const;

export default function NewEventPage({
  params,
  searchParams,
}: {
  params: { orgSlug: string; subSlug: string };
  searchParams: { error?: string };
}) {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-2xl font-bold">New event</h1>
      {searchParams.error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{searchParams.error}</p>
      )}
      <form action={createEventAction} className="space-y-4">
        <input type="hidden" name="orgSlug" value={params.orgSlug} />
        <input type="hidden" name="subSlug" value={params.subSlug} />
        <input
          name="name"
          required
          placeholder="Event name (e.g. Smith Wedding)"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <input
          name="eventDate"
          type="date"
          required
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <input
          name="location"
          placeholder="Location (optional)"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <textarea
          name="description"
          placeholder="Description (optional)"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <div>
          <label className="mb-1 block text-sm opacity-70">Theme</label>
          <select
            name="theme"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          >
            {THEMES.map((t) => (
              <option key={t} value={t}>
                {t[0] + t.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="permanentStorage" />
          Keep media forever (paid tier — otherwise expires 14 days after the event)
        </label>
        <button className="w-full rounded-lg bg-brand-600 py-2 font-semibold text-white hover:bg-brand-700">
          Create event
        </button>
      </form>
    </div>
  );
}
