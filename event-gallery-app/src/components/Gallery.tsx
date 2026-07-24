"use client";

import { useEffect, useState } from "react";

interface MediaItem {
  id: string;
  type: "IMAGE" | "VIDEO";
  url: string;
  uploaderName: string | null;
  createdAt: string;
}

const POLL_INTERVAL_MS = 8000;

export function Gallery({ eventSlug }: { eventSlug: string }) {
  const [media, setMedia] = useState<MediaItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const res = await fetch(`/api/events/${eventSlug}/media`, { cache: "no-store" });
      if (!res.ok || cancelled) return;
      const data = await res.json();
      if (!cancelled) setMedia(data.media);
    }

    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [eventSlug]);

  if (media.length === 0) {
    return (
      <p className="py-12 text-center text-sm opacity-70">
        No photos yet — be the first to add one!
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
      {media.map((item) => (
        <div key={item.id} className="aspect-square overflow-hidden rounded-lg bg-black/5">
          {item.type === "IMAGE" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.url} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <video src={item.url} className="h-full w-full object-cover" muted playsInline controls />
          )}
        </div>
      ))}
    </div>
  );
}
