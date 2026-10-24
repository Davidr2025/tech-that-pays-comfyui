import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl p-10 text-center">
      <h1 className="text-lg font-semibold">Nothing here yet</h1>
      <p className="mt-2 text-sm text-slate-600">This page doesn&apos;t exist, or the review hasn&apos;t been built.</p>
      <Link href="/" className="mt-4 inline-block text-sm text-teal-700 underline">
        Back to sessions
      </Link>
    </main>
  );
}
