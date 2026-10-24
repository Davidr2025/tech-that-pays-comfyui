import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Cockpit } from "@/components/cockpit/cockpit";
import { ownsSession, requireConsultant } from "@/server/auth";
import { getCockpitData } from "@/server/sessions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cockpit · Discovery Cockpit",
  robots: { index: false, follow: false },
};

export default async function CockpitPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  await requireConsultant();
  if (!(await ownsSession(sessionId))) notFound();
  const data = await getCockpitData(sessionId);
  if (!data) notFound();
  return <Cockpit data={data} />;
}
