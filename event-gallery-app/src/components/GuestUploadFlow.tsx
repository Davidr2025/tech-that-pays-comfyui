"use client";

import { useEffect, useState } from "react";
import { UploadWidget } from "./UploadWidget";
import { GuestCaptureCard } from "./GuestCaptureCard";

interface GuestUploadFlowProps {
  eventSlug: string;
  businessName: string;
  accentClassName: string;
  incentiveMessage: string | null;
  requireContactInfo: boolean;
  googleReviewUrl: string | null;
  onUploaded?: () => void;
}

function storageKeys(eventSlug: string) {
  return {
    guestId: `eg_guest_${eventSlug}`,
    dismissed: `eg_guest_dismissed_${eventSlug}`,
  };
}

export function GuestUploadFlow({
  eventSlug,
  businessName,
  accentClassName,
  incentiveMessage,
  requireContactInfo,
  googleReviewUrl,
  onUploaded,
}: GuestUploadFlowProps) {
  const [guestId, setGuestId] = useState<string | undefined>(undefined);
  const [resolved, setResolved] = useState(false); // capture card submitted, skipped, or already resolved
  const [showCard, setShowCard] = useState(false);

  useEffect(() => {
    const keys = storageKeys(eventSlug);
    const cachedGuestId = localStorage.getItem(keys.guestId) ?? undefined;
    const dismissed = localStorage.getItem(keys.dismissed) === "1";
    setGuestId(cachedGuestId);
    setResolved(Boolean(cachedGuestId) || dismissed);
  }, [eventSlug]);

  function handleFirstUpload() {
    if (!resolved) setShowCard(true);
    onUploaded?.();
  }

  function handleSubmitted(newGuestId: string) {
    localStorage.setItem(storageKeys(eventSlug).guestId, newGuestId);
    setGuestId(newGuestId);
    setResolved(true);
    setShowCard(false);
  }

  function handleSkip() {
    localStorage.setItem(storageKeys(eventSlug).dismissed, "1");
    setResolved(true);
    setShowCard(false);
  }

  return (
    <div>
      <UploadWidget
        eventSlug={eventSlug}
        accentClassName={accentClassName}
        guestId={guestId}
        onUploaded={handleFirstUpload}
      />

      {showCard && (
        <GuestCaptureCard
          eventSlug={eventSlug}
          businessName={businessName}
          incentiveMessage={incentiveMessage}
          requireContactInfo={requireContactInfo}
          accentClassName={accentClassName}
          onSubmitted={handleSubmitted}
          onSkip={handleSkip}
        />
      )}

      {resolved && !showCard && googleReviewUrl && (
        <a
          href={googleReviewUrl}
          target="_blank"
          rel="noreferrer"
          className={`mt-4 inline-block rounded-lg px-4 py-2 text-sm font-semibold ${accentClassName}`}
        >
          ⭐ Leave us a quick review
        </a>
      )}
    </div>
  );
}
