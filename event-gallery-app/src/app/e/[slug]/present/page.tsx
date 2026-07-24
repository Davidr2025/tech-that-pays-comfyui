import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Slideshow } from "@/components/Slideshow";

export default async function PresentPage({ params }: { params: { slug: string } }) {
  const event = await db.event.findUnique({
    where: { slug: params.slug },
    select: { id: true, slug: true, subAccount: { select: { brandColor: true } } },
  });

  if (!event) notFound();

  return <Slideshow eventSlug={event.slug} accentHex={event.subAccount.brandColor ?? undefined} />;
}
