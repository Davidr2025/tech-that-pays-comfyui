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


const SESSION_ERROR_STATUS = { NOT_FOUND: 404, INVALID: 400, CONFLICT: 409 } as const;

/** Maps the app's known error types to a response; anything else becomes a plain 500. */
export function errorResponse(err: unknown, fallback = "Something went wrong.") {
  if (err instanceof Error && "code" in err && typeof (err as { code: unknown }).code === "string") {
    const code = (err as { code: string }).code as keyof typeof SESSION_ERROR_STATUS | "NO_TRANSCRIPT";
    if (code === "NO_TRANSCRIPT") return jsonError(err.message, 400);
    if (code in SESSION_ERROR_STATUS) return jsonError(err.message, SESSION_ERROR_STATUS[code as keyof typeof SESSION_ERROR_STATUS]);
  }
  console.error(err);
  return jsonError(fallback, 500);
}
