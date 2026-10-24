import { z } from "zod";
import { prisma } from "../lib/db";
import { consultantSchema } from "../lib/validation";

export type ConsultantInput = z.input<typeof consultantSchema>;

/** This app is single-consultant for now: the first (oldest) consultant is "you". */
export async function getConsultant() {
  return prisma.consultant.findFirst({ orderBy: { createdAt: "asc" } });
}

export async function updateConsultant(id: string, input: z.output<typeof consultantSchema>) {
  return prisma.consultant.update({
    where: { id },
    data: {
      name: input.name,
      email: input.email,
      businessName: input.businessName,
      tagline: input.tagline,
      primaryColor: input.primaryColor,
      accentColor: input.accentColor,
      calendarLink: input.calendarLink,
      logoUrl: input.logoUrl,
    },
  });
}
