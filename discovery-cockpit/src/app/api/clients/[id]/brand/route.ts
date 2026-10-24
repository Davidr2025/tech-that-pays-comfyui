import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { apiConsultant } from "@/server/auth";
import { suggestClientBrand } from "@/server/clients";
import { FetchFailedError, UnsafeUrlError } from "@/server/safe-fetch";

/** Suggests brand colours from the client's saved website. Nothing is saved until the consultant accepts. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const who = await apiConsultant(req);
  if ("error" in who) return who.error;
  if (!who.consultant) return jsonError("No consultant exists yet. Run `npm run db:seed`.", 409);
  const consultant = who.consultant;
  try {
    const result = await suggestClientBrand(consultant.id, id);
    if (result.kind === "not_found") return jsonError("Client not found.", 404);
    if (result.kind === "no_website") return jsonError("Save the client's website address first.", 400);
    return NextResponse.json({ colors: result.colors });
  } catch (err) {
    if (err instanceof UnsafeUrlError) return jsonError(err.message, 400);
    if (err instanceof FetchFailedError) return jsonError(`${err.message} Pick colours by hand instead.`, 502);
    console.error(err);
    return jsonError("Could not check that website. Pick colours by hand instead.", 502);
  }
}
