import { z } from "zod";
import { isValidLogoUrl, logoProblem } from "./logo";

export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #0f766e.").transform((v) => v.toLowerCase());

/** Empty string becomes null; anything else must be an http(s) URL (https:// is added if missing). */
export const optionalUrl = z
  .string()
  .trim()
  .max(300)
  .nullish()
  .transform((v, ctx) => {
    if (!v) return null;
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`;
    try {
      const u = new URL(withScheme);
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("scheme");
      return u.toString();
    } catch {
      ctx.addIssue({ code: "custom", message: "Enter a web address like https://example.com." });
      return z.NEVER;
    }
  });

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));


export const brandColorsSchema = z
  .object({
    primary: hexColor,
    accent: hexColor.nullable(),
    source: z.enum(["website", "manual"]),
    detected: z.array(hexColor).max(6),
  })
  .strict();
export type StoredBrandColors = z.infer<typeof brandColorsSchema>;

export const logoField = z
  .string()
  .nullish()
  .transform((v, ctx) => {
    if (!v) return null;
    const problem = logoProblem(v);
    if (problem) {
      ctx.addIssue({ code: "custom", message: problem });
      return z.NEVER;
    }
    return v;
  })
  .refine((v) => v === null || isValidLogoUrl(v));

/** Whole dollars per hour, 1–2000. Empty becomes null; "$75" and "75" both work. */
export const optionalHourlyValue = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v, ctx) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(v.replace(/[$,\s]/g, ""));
    if (!Number.isInteger(n) || n < 1 || n > 2000) {
      ctx.addIssue({ code: "custom", message: "Enter whole dollars per hour, between 1 and 2000." });
      return z.NEVER;
    }
    return n;
  });

export const consultantSchema = z.object({
  name: z.string().trim().min(1, "Your name is required.").max(120),
  email: z.string().trim().email("Enter a valid email address.").max(200),
  businessName: z.string().trim().min(1, "Your business name is required.").max(120),
  tagline: optionalText(160),
  primaryColor: hexColor,
  accentColor: hexColor,
  calendarLink: optionalUrl,
  logoUrl: logoField,
});

export const clientSchema = z.object({
  name: z.string().trim().min(1, "The contact's name is required.").max(120),
  companyName: z.string().trim().min(1, "The company name is required.").max(120),
  industry: optionalText(120),
  websiteUrl: optionalUrl,
  calendarLink: optionalUrl,
  hourlyValue: optionalHourlyValue,
  brandColors: brandColorsSchema.nullish().transform((v) => v ?? null),
});

export const sessionCreateSchema = z.object({
  clientId: z.string().min(1, "Choose a client."),
  type: z.enum(["DISCOVERY", "OPERATIONAL_ASSESSMENT", "TECHNOLOGY_ASSESSMENT", "COMBINED_ASSESSMENT"]).default("DISCOVERY"),
  brandingMode: z.enum(["CONSULTANT", "CLIENT"]).default("CONSULTANT"),
});
