import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { ingest } from "@/server/ingest";

const MAX_BYTES = 100_000;

/**
 * PUBLIC on purpose: a note-taker outside the app posts transcript lines here. The token in the path is the
 * credential (see src/server/ingest.ts). It can only append lines to one session; it reads nothing.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const raw = await req.text().catch(() => "");
  if (raw.length > MAX_BYTES) return jsonError("That request is too large.", 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return jsonError("Request body must be JSON.", 400);
  }
  try {
    const me = new URL(req.url).searchParams.get("me")?.slice(0, 80) ?? null;
    const out = await ingest(token, body, me);
    return out.status === 200 ? NextResponse.json({ ok: true, accepted: out.accepted }) : jsonError(out.error, out.status);
  } catch (err) {
    console.error("[ingest] failed", err instanceof Error ? err.name : "error");
    return jsonError("Could not store that line.", 500);
  }
}
