/**
 * Server-side PDF of a client-facing page (the review or the prototype), rendered by headless Chromium
 * from the same print view the browser would print, so the file matches what a person sees.
 *
 * Chromium is optional: the app runs without it, and this module says plainly when it is missing.
 * Point `PDF_CHROMIUM_PATH` at a Chromium/Chrome binary, or install one for playwright-core
 * (`npx playwright-core install chromium`).
 *
 * The page address is built by the caller from the app's OWN loopback address (never from a request
 * header) and checked here again: this module will not fetch anything off this server.
 */
import fs from "node:fs";

export class PdfError extends Error {
  constructor(
    public code: "NOT_CONFIGURED" | "FAILED" | "BUSY" | "FORBIDDEN_URL",
    message: string,
  ) {
    super(message);
  }
}

/** Where the app can reach itself. INTERNAL_URL overrides the loopback default (a container with another port, say). */
export function internalBase(env: Record<string, string | undefined> = process.env): string {
  return (env.INTERNAL_URL?.trim() || `http://127.0.0.1:${env.PORT?.trim() || "3000"}`).replace(/\/+$/, "");
}

const MAX_CONCURRENT = 2;
const TIMEOUT_MS = 30_000;
let running = 0;

async function executable(env: Record<string, string | undefined>): Promise<string> {
  const explicit = env.PDF_CHROMIUM_PATH?.trim();
  if (explicit) {
    if (!fs.existsSync(explicit)) throw new PdfError("NOT_CONFIGURED", "PDF_CHROMIUM_PATH points to a file that does not exist.");
    return explicit;
  }
  const { chromium } = await import("playwright-core");
  const path = chromium.executablePath();
  if (!fs.existsSync(path)) {
    throw new PdfError("NOT_CONFIGURED", "PDF files need Chromium on this server. Set PDF_CHROMIUM_PATH, or run `npx playwright-core install chromium`.");
  }
  return path;
}

/** Whether PDFs can be made here, without launching anything. */
export async function pdfAvailable(env: Record<string, string | undefined> = process.env): Promise<boolean> {
  try {
    await executable(env);
    return true;
  } catch {
    return false;
  }
}

export async function renderPdf(url: string, opts: { base?: string; env?: Record<string, string | undefined> } = {}): Promise<Buffer> {
  const env = opts.env ?? process.env;
  const base = opts.base ?? internalBase(env);
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    throw new PdfError("FORBIDDEN_URL", "That is not a page address.");
  }
  if (target.origin !== new URL(base).origin || target.username || target.password) {
    throw new PdfError("FORBIDDEN_URL", "Only this app's own pages can be turned into a PDF.");
  }

  const path = await executable(env);
  if (running >= MAX_CONCURRENT) throw new PdfError("BUSY", "Two PDFs are already being made. Try again in a moment.");
  running += 1;
  let browser: import("playwright-core").Browser | null = null;
  try {
    const { chromium } = await import("playwright-core");
    browser = await chromium.launch({ executablePath: path, timeout: TIMEOUT_MS });
    const page = await browser.newPage();
    // Nothing outside this server: the page may only load its own files (fonts, styles, images).
    await page.route("**/*", (route) => {
      const u = route.request().url();
      return u.startsWith("data:") || new URL(u).origin === target.origin ? route.continue() : route.abort();
    });
    const res = await page.goto(target.toString(), { waitUntil: "networkidle", timeout: TIMEOUT_MS });
    if (!res || !res.ok()) throw new PdfError("FAILED", `The page could not be loaded (${res?.status() ?? "no response"}).`);
    await page.emulateMedia({ media: "print" });
    return Buffer.from(await page.pdf({ format: "A4", printBackground: true, margin: { top: "12mm", bottom: "12mm", left: "10mm", right: "10mm" } }));
  } catch (err) {
    if (err instanceof PdfError) throw err;
    console.error("PDF rendering failed", err);
    throw new PdfError("FAILED", "The PDF could not be made.");
  } finally {
    running -= 1; // always released, including when the browser failed to start
    await browser?.close().catch(() => undefined);
  }
}
