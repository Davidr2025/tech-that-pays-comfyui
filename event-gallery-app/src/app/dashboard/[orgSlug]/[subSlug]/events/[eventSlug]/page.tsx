import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSubAccountRole } from "@/lib/authz";
import { db } from "@/lib/db";
import { publicUrlFor } from "@/lib/storage";
import { eventPublicUrl } from "@/lib/qrcode";
import { setMediaStatusAction } from "@/lib/actions/events";
import { publishToSocialAction } from "@/lib/actions/publish";

export default async function EventDetailPage({
  params,
}: {
  params: { orgSlug: string; subSlug: string; eventSlug: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const event = await db.event.findUnique({
    where: { slug: params.eventSlug },
    include: {
      subAccount: { include: { socialConnections: true } },
      media: { orderBy: { createdAt: "desc" } },
      scheduledPosts: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!event) notFound();

  const role = await getSubAccountRole(user.id, event.subAccountId);
  if (!role) notFound();

  const redirectTo = `/dashboard/${params.orgSlug}/${params.subSlug}/events/${params.eventSlug}`;
  const approvedMedia = event.media.filter((m) => m.status === "APPROVED" && m.uploadConfirmed);
  const guestUrl = eventPublicUrl(event.slug);

  return (
    <div className="space-y-10">
      <div>
        <Link href={`/dashboard/${params.orgSlug}/${params.subSlug}`} className="text-sm underline opacity-70">
          ← Back to {event.subAccount.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{event.name}</h1>
        <p className="text-sm opacity-60">
          {new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(event.eventDate)}
        </p>
      </div>

      <section className="grid gap-6 sm:grid-cols-[200px_1fr]">
        <div>
          {event.qrCodeStorageKey ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={publicUrlFor(event.qrCodeStorageKey)}
              alt="Event QR code"
              className="h-48 w-48 rounded-lg border border-neutral-200 dark:border-neutral-800"
            />
          ) : (
            <div className="flex h-48 w-48 items-center justify-center rounded-lg border border-dashed text-xs opacity-60">
              QR not generated (configure object storage)
            </div>
          )}
        </div>
        <div className="space-y-2">
          <p className="text-sm opacity-70">Guest upload link</p>
          <code className="block break-all rounded-lg bg-neutral-100 p-3 text-sm dark:bg-neutral-900">
            {guestUrl}
          </code>
          <div className="flex gap-3 text-sm">
            <a href={guestUrl} target="_blank" className="underline" rel="noreferrer">
              Open event page
            </a>
            <a href={`${guestUrl}/present`} target="_blank" className="underline" rel="noreferrer">
              Open slideshow
            </a>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Moderate uploads ({event.media.length})</h2>
        {event.media.length === 0 ? (
          <p className="text-sm opacity-60">No uploads yet.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {event.media.map((m) => (
              <div key={m.id} className="relative aspect-square overflow-hidden rounded-lg bg-black/5">
                {m.type === "IMAGE" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={publicUrlFor(m.storageKey)} alt="" className="h-full w-full object-cover" />
                ) : (
                  <video src={publicUrlFor(m.storageKey)} className="h-full w-full object-cover" muted />
                )}
                <div className="absolute inset-x-0 bottom-0 flex justify-between gap-1 bg-black/60 p-1">
                  <form action={setMediaStatusAction}>
                    <input type="hidden" name="mediaId" value={m.id} />
                    <input type="hidden" name="status" value="APPROVED" />
                    <input type="hidden" name="redirectTo" value={redirectTo} />
                    <button
                      className={`rounded px-1.5 py-0.5 text-xs ${
                        m.status === "APPROVED" ? "bg-green-500 text-white" : "bg-white/80"
                      }`}
                    >
                      ✓
                    </button>
                  </form>
                  <form action={setMediaStatusAction}>
                    <input type="hidden" name="mediaId" value={m.id} />
                    <input type="hidden" name="status" value="REJECTED" />
                    <input type="hidden" name="redirectTo" value={redirectTo} />
                    <button
                      className={`rounded px-1.5 py-0.5 text-xs ${
                        m.status === "REJECTED" ? "bg-red-500 text-white" : "bg-white/80"
                      }`}
                    >
                      ✕
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Publish to social</h2>
        {event.subAccount.socialConnections.length === 0 ? (
          <p className="text-sm opacity-60">
            No social connections yet.{" "}
            <Link href={`/dashboard/${params.orgSlug}/${params.subSlug}/connections/new`} className="underline">
              Connect Blotato or GHL
            </Link>{" "}
            to publish gallery media.
          </p>
        ) : approvedMedia.length === 0 ? (
          <p className="text-sm opacity-60">Approve at least one upload above before publishing.</p>
        ) : (
          <form action={publishToSocialAction} className="max-w-lg space-y-3">
            <input type="hidden" name="eventSlug" value={event.slug} />
            <input type="hidden" name="redirectTo" value={redirectTo} />

            <select
              name="connectionId"
              required
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            >
              {event.subAccount.socialConnections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} ({c.provider})
                </option>
              ))}
            </select>

            <input
              name="platform"
              required
              placeholder="Platform (e.g. instagram, tiktok, facebook)"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />

            <textarea
              name="caption"
              placeholder="Caption"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />

            <div>
              <label className="mb-1 block text-xs opacity-70">Schedule for later (optional)</label>
              <input
                name="scheduledFor"
                type="datetime-local"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              />
            </div>

            <div>
              <p className="mb-1 text-xs opacity-70">Select media to include</p>
              <div className="grid grid-cols-5 gap-1">
                {approvedMedia.map((m) => (
                  <label key={m.id} className="relative block aspect-square cursor-pointer overflow-hidden rounded">
                    <input type="checkbox" name="mediaIds" value={m.id} className="absolute left-1 top-1 z-10" />
                    {m.type === "IMAGE" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={publicUrlFor(m.storageKey)} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <video src={publicUrlFor(m.storageKey)} className="h-full w-full object-cover" muted />
                    )}
                  </label>
                ))}
              </div>
            </div>

            <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
              Publish
            </button>
          </form>
        )}

        {event.scheduledPosts.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-2 text-sm font-semibold opacity-70">Recent publishes</h3>
            <ul className="space-y-1 text-sm">
              {event.scheduledPosts.map((p) => (
                <li key={p.id} className="flex items-center justify-between rounded-lg bg-neutral-100 px-3 py-2 dark:bg-neutral-900">
                  <span>
                    {p.provider} · {p.targetPlatforms.join(", ")}
                  </span>
                  <span
                    className={
                      p.status === "PUBLISHED"
                        ? "text-green-600"
                        : p.status === "FAILED"
                          ? "text-red-600"
                          : "opacity-70"
                    }
                  >
                    {p.status}
                    {p.error ? ` — ${p.error}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
