"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface MediaItem {
  id: string;
  type: "IMAGE" | "VIDEO";
  url: string;
}

const SLIDE_DURATION_MS = 6000;
const POLL_INTERVAL_MS = 15000;

export function Slideshow({ eventSlug, accentHex }: { eventSlug: string; accentHex?: string }) {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [index, setIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (media.length === 0) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % media.length);
    }, SLIDE_DURATION_MS);
    return () => clearInterval(timer);
  }, [media.length]);

  const enterFullscreen = useCallback(() => {
    containerRef.current?.requestFullscreen?.().catch(() => {
      // Fullscreen may be blocked (e.g. no user gesture yet) — the slideshow
      // still runs windowed, so this is a non-fatal enhancement.
    });
  }, []);

  if (media.length === 0) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-black text-white">
        <p className="text-lg opacity-70">Waiting for the first photo…</p>
      </div>
    );
  }

  const current = media[index % media.length];
  if (!current) return null;

  return (
    <div
      ref={containerRef}
      onClick={enterFullscreen}
      className="relative flex h-screen w-screen cursor-pointer items-center justify-center bg-black"
      style={{ backgroundColor: "black" }}
    >
      {current.type === "IMAGE" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={current.id}
          src={current.url}
          alt=""
          className="max-h-full max-w-full animate-[fadeIn_0.6s_ease-in-out] object-contain"
        />
      ) : (
        <video
          key={current.id}
          src={current.url}
          className="max-h-full max-w-full object-contain"
          autoPlay
          muted
          playsInline
          onEnded={() => setIndex((i) => (i + 1) % media.length)}
        />
      )}

      <div className="absolute bottom-4 right-4 flex gap-1.5">
        {media.slice(0, 40).map((m, i) => (
          <span
            key={m.id}
            className="h-1.5 w-1.5 rounded-full"
            style={{
              backgroundColor: i === index % media.length ? (accentHex ?? "#8b5cf6") : "rgba(255,255,255,0.3)",
            }}
          />
        ))}
      </div>

      <p className="absolute left-4 top-4 text-xs text-white/50">
        Tap anywhere for full screen
      </p>
    </div>
  );
}
