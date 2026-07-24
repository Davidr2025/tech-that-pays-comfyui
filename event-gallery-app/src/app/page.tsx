import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center gap-8 px-6 text-center">
      <span className="rounded-full bg-brand-100 px-4 py-1 text-sm font-medium text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
        For photographers, venues &amp; agencies
      </span>
      <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
        Every guest photo.
        <br />
        <span className="text-brand-600 dark:text-brand-400">One live gallery.</span>
      </h1>
      <p className="max-w-2xl text-lg text-neutral-600 dark:text-neutral-400">
        Guests scan a QR code and upload straight to a shared event gallery — no
        app, no login. Play it back as a full-screen slideshow on any TV, and
        push the best shots straight to social.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-4">
        <Link
          href="/dashboard"
          className="rounded-lg bg-brand-600 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          Go to dashboard
        </Link>
        <a
          href="#how-it-works"
          className="rounded-lg border border-neutral-300 px-6 py-3 font-semibold text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-900"
        >
          How it works
        </a>
      </div>

      <div
        id="how-it-works"
        className="mt-12 grid w-full grid-cols-1 gap-6 text-left sm:grid-cols-3"
      >
        {[
          {
            title: "1. Create an event",
            body: "Pick a theme, set the date, get a unique QR code and link in seconds.",
          },
          {
            title: "2. Guests upload",
            body: "Anyone with the link or QR code can drop in photos and videos instantly — no account needed.",
          },
          {
            title: "3. Play it back, publish it",
            body: "Full-screen slideshow on any browser, plus one-click publishing to social via Blotato or GHL.",
          },
        ].map((step) => (
          <div
            key={step.title}
            className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <h3 className="mb-2 font-semibold">{step.title}</h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {step.body}
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}
