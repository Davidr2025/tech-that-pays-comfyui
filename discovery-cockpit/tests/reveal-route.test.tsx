/**
 * Privacy at the ROUTE level: the whole page a client's browser receives — the document
 * <head> metadata as well as the body — not just the RevealView component.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { metadata as rootMetadata } from "@/app/layout";
import RevealPage, { metadata as revealMetadata } from "@/app/reveal/[sessionId]/page";
import { prisma } from "@/lib/db";
import { buildClientReview } from "@/server/review";
import { FORBIDDEN_TEXT, findLeaks, htmlToText, makeDemoSession } from "./helpers";

let sessionId: string;

beforeAll(async () => {
  sessionId = (await makeDemoSession("route")).id;
  await buildClientReview(sessionId);
  await prisma.session.update({ where: { id: sessionId }, data: { internalNotes: "SENTINEL-ROUTE-NOTES", decisionReadiness: 8137 } });
});

const render = async (searchParams: { print?: string } = {}) =>
  renderToStaticMarkup(await RevealPage({ params: Promise.resolve({ sessionId }), searchParams: Promise.resolve(searchParams) }));

describe("reveal route", () => {
  it("sets its own title and description, so the root layout's never reaches a client", () => {
    expect(revealMetadata.title).toBe("Client Review");
    expect(typeof revealMetadata.description).toBe("string");
    // What the browser actually gets is the root metadata overridden by the page's.
    const effective = JSON.stringify({ ...rootMetadata, ...revealMetadata });
    expect(findLeaks(effective, FORBIDDEN_TEXT)).toEqual([]);
  });

  it("also keeps the root layout's own metadata free of product-internal language", () => {
    expect(findLeaks(JSON.stringify(rootMetadata), FORBIDDEN_TEXT)).toEqual([]);
  });

  it("serves a page with no private text, in screen and print variants", async () => {
    for (const variant of [{}, { print: "1" }]) {
      const text = htmlToText(await render(variant));
      expect(text).toContain("What We Heard");
      expect(findLeaks(text, [...FORBIDDEN_TEXT, "SENTINEL-ROUTE-NOTES", "8137", "cockpit"])).toEqual([]);
    }
  });

  it("offers the PDF button on screen and opens the print flow on ?print=1", async () => {
    expect(await render()).toContain("/reveal/" + sessionId + "?print=1");
    expect(htmlToText(await render({ print: "1" }))).toContain("Save as PDF");
  });

  it("404s when no review has been built, instead of showing an empty or partial page", async () => {
    const unbuilt = await makeDemoSession("unbuilt");
    await expect(RevealPage({ params: Promise.resolve({ sessionId: unbuilt.id }), searchParams: Promise.resolve({}) })).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK|NEXT_NOT_FOUND/);
  });

  it("fails closed on a tampered payload", async () => {
    const original = await prisma.report.findUniqueOrThrow({ where: { sessionId } });
    await prisma.report.update({ where: { sessionId }, data: { revealData: { ...(original.revealData as object), decisionReadiness: 99 } } });
    const text = htmlToText(await render());
    expect(text).toContain("isn't available");
    expect(text).not.toContain("99");
    await prisma.report.update({ where: { sessionId }, data: { revealData: original.revealData as object } });
  });
});
