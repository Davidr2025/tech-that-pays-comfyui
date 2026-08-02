import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";

const bodySchema = z
  .object({
    name: z.string().max(120).trim().optional(),
    email: z.string().email().max(320).trim().optional(),
    phone: z.string().min(7).max(20).trim().optional(),
    emailConsent: z.boolean().optional(),
    smsConsent: z.boolean().optional(),
  })
  .refine((data) => Boolean(data.email) || Boolean(data.phone), {
    message: "Provide an email or phone number",
  })
  .refine((data) => !data.email || data.emailConsent, {
    message: "Email consent is required to save an email address",
  })
  .refine((data) => !data.phone || data.smsConsent, {
    message: "SMS consent is required to save a phone number",
  });

const GUEST_RATE_LIMIT = 5; // per IP, per event — this is a one-time-per-visit form, not repeated
const GUEST_RATE_WINDOW_SECONDS = 10 * 60;

// No auth required — submitted from the guest-facing upload page.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const event = await db.event.findUnique({ where: { slug: params.slug } });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const rateLimitKey = `guest-capture:${clientIpFrom(req)}:${event.id}`;
  const allowed = await checkRateLimit(rateLimitKey, GUEST_RATE_LIMIT, GUEST_RATE_WINDOW_SECONDS);
  if (!allowed) {
    return NextResponse.json({ error: "Too many attempts — please try again shortly" }, { status: 429 });
  }

  const guest = await db.guest.create({
    data: {
      subAccountId: event.subAccountId,
      eventId: event.id,
      name: parsed.data.name || null,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      emailConsent: Boolean(parsed.data.email && parsed.data.emailConsent),
      smsConsent: Boolean(parsed.data.phone && parsed.data.smsConsent),
    },
  });

  return NextResponse.json({ guestId: guest.id });
}
