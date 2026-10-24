import { z } from "zod";
import { prisma } from "../lib/db";
import { AuthError } from "./accounts";
import { consultantSchema } from "../lib/validation";

export type ConsultantInput = z.input<typeof consultantSchema>;

export async function updateConsultant(id: string, input: z.output<typeof consultantSchema>) {
  try {
    return await save(id, input);
  } catch (err) {
    if (typeof err === "object" && err && "code" in err && (err as { code: string }).code === "P2002") {
      throw new AuthError("CONFLICT", "That email is already used by another account.");
    }
    throw err;
  }
}

function save(id: string, input: z.output<typeof consultantSchema>) {
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
      embedBooking: input.embedBooking,
      aiProvider: input.aiProvider,
      logoUrl: input.logoUrl,
    },
  });
}
