import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AutoPrint, RevealActions } from "@/components/reveal/reveal-actions";
import { RevealView } from "@/components/reveal/reveal-view";
import { getRevealPayload } from "@/server/reveal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Client Review",
  // Overrides the root layout's description: the client sees this page's <head>, too.
  description: "A summary of our discovery conversation.",
  robots: { index: false, follow: false },
};

export default async function RevealPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const { sessionId } = await params;
  const { print } = await searchParams;

  let data;
  try {
    data = await getRevealPayload(sessionId);
  } catch {
    // The stored payload failed the allow-list check. Show nothing rather than risk a leak.
    return (
      <main className="mx-auto max-w-xl p-10 text-center text-slate-600">
        <h1 className="text-lg font-semibold">This review isn&apos;t available</h1>
        <p className="mt-2 text-sm">It needs to be rebuilt by the consultant.</p>
      </main>
    );
  }
  if (!data) notFound();

  return (
    <main className="bg-slate-100 px-4 py-8 print:bg-white print:p-0">
      {print === "1" ? <AutoPrint /> : <RevealActions sessionId={sessionId} />}
      <RevealView data={data} />
    </main>
  );
}
