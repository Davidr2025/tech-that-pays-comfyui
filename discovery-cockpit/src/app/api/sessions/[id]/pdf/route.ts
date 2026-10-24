import { z } from "zod";
import { errorResponse, jsonError } from "@/lib/api";
import { guardSession } from "@/server/auth";
import { documentPdf } from "@/server/outgoing";

export const dynamic = "force-dynamic";

const doc = z.enum(["review", "prototype"]);

/** A PDF file of the client review or the prototype, made on the server from the print view. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const denied = await guardSession(req, id);
  if (denied) return denied;
  const kind = doc.safeParse(new URL(req.url).searchParams.get("doc") ?? "review");
  if (!kind.success) return jsonError("Choose review or prototype.", 400);
  try {
    const { filename, pdf } = await documentPdf(id, kind.data);
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err, "Could not make the PDF.");
  }
}
