import { NextResponse } from "next/server";
import type { ZodType } from "zod";

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** Parses a JSON body with a zod schema; returns either the data or a ready 400 response. */
export async function readBody<T>(req: Request, schema: ZodType<T>): Promise<{ data: T } | { error: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { error: jsonError("Request body must be JSON.", 400) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { error: jsonError(parsed.error.issues[0]?.message ?? "Invalid request body.", 400) };
  return { data: parsed.data };
}
