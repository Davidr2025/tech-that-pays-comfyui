"use client";

import { useState } from "react";

interface GuestCaptureCardProps {
  eventSlug: string;
  businessName: string;
  incentiveMessage: string | null;
  requireContactInfo: boolean;
  accentClassName: string;
  onSubmitted: (guestId: string) => void;
  onSkip: () => void;
}

export function GuestCaptureCard({
  eventSlug,
  businessName,
  incentiveMessage,
  requireContactInfo,
  accentClassName,
  onSubmitted,
  onSkip,
}: GuestCaptureCardProps) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [emailConsent, setEmailConsent] = useState(false);
  const [smsConsent, setSmsConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasEmail = email.trim().length > 0;
  const hasPhone = phone.trim().length > 0;
  const canSubmit =
    (hasEmail || hasPhone) && (!hasEmail || emailConsent) && (!hasPhone || smsConsent) && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventSlug}/guest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: hasEmail ? email.trim() : undefined,
          phone: hasPhone ? phone.trim() : undefined,
          emailConsent,
          smsConsent,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save your info");
      onSubmitted(data.guestId as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 rounded-xl border border-black/10 bg-white/90 p-5 text-neutral-900 shadow-sm backdrop-blur dark:border-white/10 dark:bg-neutral-900/90 dark:text-neutral-100"
    >
      <p className="mb-3 text-sm font-medium">
        {incentiveMessage || `Want your photos backed up? Leave your email or phone (optional).`}
      </p>

      <div className="space-y-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        />
        {hasEmail && (
          <label className="flex items-start gap-2 text-xs opacity-80">
            <input
              type="checkbox"
              checked={emailConsent}
              onChange={(e) => setEmailConsent(e.target.checked)}
              className="mt-0.5"
            />
            I agree to receive emails from {businessName}, including review requests and offers.
          </label>
        )}

        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        />
        {hasPhone && (
          <label className="flex items-start gap-2 text-xs opacity-80">
            <input
              type="checkbox"
              checked={smsConsent}
              onChange={(e) => setSmsConsent(e.target.checked)}
              className="mt-0.5"
            />
            I agree to receive text messages from {businessName}, including review requests and
            promotions. Msg &amp; data rates may apply. Reply STOP to opt out.
          </label>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={!canSubmit}
          className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${accentClassName}`}
        >
          {submitting ? "Saving…" : "Submit"}
        </button>
        {!requireContactInfo && (
          <button
            type="button"
            onClick={onSkip}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
          >
            Skip
          </button>
        )}
      </div>
    </form>
  );
}
