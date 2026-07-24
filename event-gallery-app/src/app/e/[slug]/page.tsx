import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { THEME_STYLES } from "@/lib/themes";
import { UploadWidget } from "@/components/UploadWidget";
import { Gallery } from "@/components/Gallery";

export default async function EventPage({ params }: { params: { slug: string } }) {
  const event = await db.event.findUnique({
    where: { slug: params.slug },
    include: { subAccount: true },
  });

  if (!event) notFound();

  const expired = event.expiresAt !== null && event.expiresAt < new Date();
  const theme = THEME_STYLES[event.theme];

  return (
    <main className={`min-h-screen ${theme.bg}`}>
      <div className="mx-auto max-w-3xl px-6 py-12">
        <header className="mb-8 text-center">
          <p className="text-sm uppercase tracking-widest opacity-70">
            {event.subAccount.name}
          </p>
          <h1 className={`mt-2 text-4xl font-bold ${theme.heading}`}>{event.name}</h1>
          {event.location && <p className="mt-2 opacity-80">{event.location}</p>}
          <p className="mt-1 text-sm opacity-70">
            {new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(event.eventDate)}
          </p>
          {event.description && <p className="mx-auto mt-4 max-w-xl opacity-90">{event.description}</p>}
        </header>

        {expired ? (
          <div className="rounded-xl bg-black/10 p-6 text-center">
            This event gallery has closed. Thanks for celebrating with us!
          </div>
        ) : (
          <>
            <div className="mb-10">
              <UploadWidget eventSlug={event.slug} accentClassName={theme.accent} />
            </div>
            <a
              href={`/e/${event.slug}/present`}
              className="mb-6 inline-block text-sm underline opacity-80 hover:opacity-100"
            >
              ▶ Open full-screen slideshow
            </a>
            <Gallery eventSlug={event.slug} />
          </>
        )}
      </div>
    </main>
  );
}
