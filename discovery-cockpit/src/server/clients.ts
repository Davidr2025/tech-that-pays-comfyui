import { z } from "zod";
import { prisma } from "../lib/db";
import { brandColorsSchema, clientSchema, type StoredBrandColors } from "../lib/validation";
import { detectBrandColors } from "./brand";

export async function listClients(consultantId: string) {
  const rows = await prisma.client.findMany({
    where: { consultantId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { sessions: true } } },
  });
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    companyName: c.companyName,
    websiteUrl: c.websiteUrl,
    sessionCount: c._count.sessions,
    brand: parseBrandColors(c.brandColors),
  }));
}

export function parseBrandColors(value: unknown): StoredBrandColors | null {
  const parsed = brandColorsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function getClient(consultantId: string, id: string) {
  const c = await prisma.client.findFirst({
    where: { id, consultantId },
    include: { sessions: { orderBy: { createdAt: "desc" }, select: { id: true, title: true, status: true, createdAt: true } } },
  });
  if (!c) return null;
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    companyName: c.companyName,
    industry: c.industry,
    websiteUrl: c.websiteUrl,
    calendarLink: c.calendarLink,
    hourlyValue: c.hourlyValue,
    brand: parseBrandColors(c.brandColors),
    sessions: c.sessions.map((s) => ({ id: s.id, title: s.title, status: s.status })),
  };
}

export async function createClient(consultantId: string, input: z.output<typeof clientSchema>) {
  return prisma.client.create({ data: clientData(consultantId, input) });
}

export async function updateClient(consultantId: string, id: string, input: z.output<typeof clientSchema>) {
  const owned = await prisma.client.count({ where: { id, consultantId } });
  if (!owned) return null;
  return prisma.client.update({ where: { id }, data: clientData(consultantId, input) });
}

function clientData(consultantId: string, input: z.output<typeof clientSchema>) {
  return {
    consultantId,
    name: input.name,
    email: input.email,
    companyName: input.companyName,
    industry: input.industry,
    websiteUrl: input.websiteUrl,
    calendarLink: input.calendarLink,
    hourlyValue: input.hourlyValue,
    brandColors: input.brandColors ?? undefined,
  };
}

/** Looks at the client's saved website and returns colour suggestions. Saves nothing. */
export async function suggestClientBrand(consultantId: string, id: string) {
  const client = await prisma.client.findFirst({ where: { id, consultantId }, select: { websiteUrl: true } });
  if (!client) return { kind: "not_found" as const };
  if (!client.websiteUrl) return { kind: "no_website" as const };
  return { kind: "ok" as const, colors: await detectBrandColors(client.websiteUrl) };
}
