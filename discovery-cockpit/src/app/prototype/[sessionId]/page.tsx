import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrototypeView } from "@/components/prototype/prototype-view";
import { getPrototype } from "@/server/prototype";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Prototype Dashboard",
  description: "A prototype dashboard concept.",
  robots: { index: false, follow: false },
};

export default async function PrototypePage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;

  let payload;
  try {
    payload = await getPrototype(sessionId);
  } catch {
    // A stored module failed its allow-list check. Show nothing rather than risk a leak.
    return (
      <main className="mx-auto max-w-xl p-10 text-center text-slate-600">
        <h1 className="text-lg font-semibold">This prototype isn&apos;t available</h1>
        <p className="mt-2 text-sm">It needs to be rebuilt by the consultant.</p>
      </main>
    );
  }
  if (!payload) notFound();

  return (
    <main className="bg-slate-100 px-4 py-8">
      <PrototypeView payload={payload} />
    </main>
  );
}
