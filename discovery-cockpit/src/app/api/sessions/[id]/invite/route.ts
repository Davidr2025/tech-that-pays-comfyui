import { z } from "zod";
import { errorResponse, jsonError } from "@/lib/api";
import { guardSession } from "@/server/auth";
import { inviteFor } from "@/server/outgoing";

export const dynamic = "force-dynamic";

const query = z.object({ start: z.string().min(1).max(40), minutes: z.coerce.number().int() });

/** The follow-up meeting as a calendar file the consultant can open or forward. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const denied = await guardSession(req, id);
  if (denied) return denied;
  const q = query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) return jsonError("Give a start time and a length in minutes.", 400);
  try {
    const { filename, ics } = await inviteFor(id, q.data);
    return new Response(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8; method=REQUEST", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err, "Could not make the invite.");
  }
}
