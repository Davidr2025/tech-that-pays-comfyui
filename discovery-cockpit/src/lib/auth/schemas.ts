import { z } from "zod";
import { MAX_PASSWORD } from "./password";

const email = z.string().trim().toLowerCase().email("Enter a valid email address.").max(200);

export const signupSchema = z
  .object({
    name: z.string().trim().min(1, "Your name is required.").max(120),
    businessName: z.string().trim().min(1, "Your business name is required.").max(120),
    email,
    password: z.string().max(MAX_PASSWORD, `Keep it under ${MAX_PASSWORD} characters.`),
  })
  .strict();

export const loginSchema = z.object({ email, password: z.string().max(MAX_PASSWORD) }).strict();

export const passwordChangeSchema = z
  .object({ current: z.string().max(MAX_PASSWORD), next: z.string().max(MAX_PASSWORD) })
  .strict();
