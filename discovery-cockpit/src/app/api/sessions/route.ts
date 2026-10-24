import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, readBody } from "@/lib/api";
import { createSession } from "@/server/sessions";

const body = z.object({
  clientName: z.string().trim().min(1, "Client name is required.").max(120),
  companyName: z.string().trim().min(1, "Company name is required.").max(120),
});

export async function POST(req: Request) {
  const parsed = await readBody(req, body);
  if ("error" in parsed) return parsed.error;
  try {
    const session = await createSession(parsed.data);
    return NextResponse.json({ id: session.id }, { status: 201 });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Could not create the session.", 500);
  }
}
