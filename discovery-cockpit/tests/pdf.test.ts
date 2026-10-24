/** Server-side PDF: real headless Chromium against real local HTTP servers. Skipped where no Chromium is available. */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { internalBase, pdfAvailable, PdfError, renderPdf } from "@/server/pdf";

const CHROME = process.env.PDF_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";
const haveChrome = fs.existsSync(CHROME);
const havePdftotext = (() => {
  try {
    execFileSync("pdftotext", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();
const env = { PDF_CHROMIUM_PATH: CHROME };

const listen = (handler: http.RequestListener) =>
  new Promise<{ server: http.Server; base: string }>((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => resolve({ server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }));
  });
const text = (pdf: Buffer) => {
  fs.writeFileSync("/tmp/pdf-test.pdf", pdf);
  return execFileSync("pdftotext", ["/tmp/pdf-test.pdf", "-"]).toString();
};
const rejection = async (p: Promise<unknown>) => ((await p.then(() => null, (e) => e)) as PdfError | null);

let app: { server: http.Server; base: string };
let other: { server: http.Server; base: string };
let otherHits: string[];
let launched = 0;

beforeAll(async () => {
  otherHits = [];
  other = await listen((req, res) => {
    otherHits.push(req.url ?? "");
    res.writeHead(200, { "Content-Type": "image/svg+xml" });
    res.end('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
  });
  app = await listen((req, res) => {
    launched += 1;
    if (req.url === "/ok") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<!doctype html><title>t</title><style>@media print{.screen-only{display:none}} .print-only{display:none} @media print{.print-only{display:block}}</style><h1>Review for Brightline</h1><p class='screen-only'>SCREEN-ONLY-CONTROL</p><p class='print-only'>PRINT-ONLY-NOTE</p>");
    } else if (req.url?.startsWith("/slow")) {
      setTimeout(() => {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<h1>slow page</h1>");
      }, 1500);
    } else if (req.url === "/third-party") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<h1>Has a tracker</h1><img src="${other.base}/pixel.svg"><script src="${other.base}/track.js"></script><iframe src="${other.base}/frame"></iframe>`);
    } else if (req.url === "/long") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<h1>Long</h1>${"<p>Paragraph of text to force a second page. </p>".repeat(400)}`);
    } else {
      res.writeHead(404, { "Content-Type": "text/html" });
      res.end("nope");
    }
  });
});
afterAll(() => {
  app.server.close();
  other.server.close();
});

describe("addresses", () => {
  it("the app reaches itself on loopback, not through a request header", () => {
    expect(internalBase({})).toBe("http://127.0.0.1:3000");
    expect(internalBase({ PORT: "4100" })).toBe("http://127.0.0.1:4100");
    expect(internalBase({ INTERNAL_URL: "http://web:8080/" })).toBe("http://web:8080");
    expect(internalBase({ PORT: "  " })).toBe("http://127.0.0.1:3000");
  });

  it.each([
    ["another host", "http://evil.test/reveal/x"],
    ["the same host on another port", "http://127.0.0.1:1/reveal/x"],
    ["a file", "file:///etc/passwd"],
    ["a data page", "data:text/html,<h1>x</h1>"],
    ["credentials in the address", "http://user:pw@127.0.0.1:3000/x"],
    ["garbage", "not a url"],
    ["a protocol-relative address", "//evil.test/x"],
  ])("refuses %s before launching anything", async (_n, url) => {
    const err = await rejection(renderPdf(url, { base: "http://127.0.0.1:3000", env }));
    expect(err).toBeInstanceOf(PdfError);
    expect(err!.code).toBe("FORBIDDEN_URL");
  });
});

describe("when Chromium is not set up", () => {
  it("says so plainly for a bad PDF_CHROMIUM_PATH", async () => {
    const err = await rejection(renderPdf(`${app.base}/ok`, { base: app.base, env: { PDF_CHROMIUM_PATH: "/nonexistent/chrome" } }));
    expect(err!.code).toBe("NOT_CONFIGURED");
    expect(err!.message).toMatch(/PDF_CHROMIUM_PATH/);
    expect(await pdfAvailable({ PDF_CHROMIUM_PATH: "/nonexistent/chrome" })).toBe(false);
  });
  it("says so when nothing is configured and no browser was installed for playwright", async () => {
    const { chromium } = await import("playwright-core");
    if (fs.existsSync(chromium.executablePath())) return; // a dev machine that did install one
    const err = await rejection(renderPdf(`${app.base}/ok`, { base: app.base, env: {} }));
    expect(err!.code).toBe("NOT_CONFIGURED");
    expect(err!.message).toMatch(/playwright-core install chromium/);
  });
});

describe.skipIf(!haveChrome)("rendering", () => {
  it("is available when configured", async () => {
    expect(await pdfAvailable(env)).toBe(true);
  });

  it("makes a real, multi-page A4 PDF", async () => {
    const pdf = await renderPdf(`${app.base}/long`, { base: app.base, env });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(2000);
    expect(pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g)!.length).toBeGreaterThanOrEqual(2);
  }, 30_000);

  it.skipIf(!havePdftotext)("is A4, and spans more than one page for long content", async () => {
    const pdf = await renderPdf(`${app.base}/long`, { base: app.base, env });
    fs.writeFileSync("/tmp/pdf-test.pdf", pdf);
    const info = execFileSync("pdfinfo", ["/tmp/pdf-test.pdf"]).toString();
    expect(info).toMatch(/Page size:\s+59[56]\.\d+ x 84[12]\.\d+ pts \(A4\)/);
    expect(Number(info.match(/Pages:\s+(\d+)/)![1])).toBeGreaterThanOrEqual(2);
  }, 30_000);

  it.skipIf(!havePdftotext)("uses the print view: print rules apply, so screen-only controls are absent", async () => {
    const content = text(await renderPdf(`${app.base}/ok`, { base: app.base, env }));
    expect(content).toContain("Review for Brightline");
    expect(content).toContain("PRINT-ONLY-NOTE");
    expect(content).not.toContain("SCREEN-ONLY-CONTROL");
  }, 30_000);

  it("refuses to fetch anything from another origin while rendering", async () => {
    otherHits.length = 0;
    const pdf = await renderPdf(`${app.base}/third-party`, { base: app.base, env });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-"); // the page still renders without them
    expect(otherHits).toEqual([]); // the pixel, the script and the frame were never requested
  }, 30_000);

  it("fails clearly for a page that does not load", async () => {
    const err = await rejection(renderPdf(`${app.base}/missing`, { base: app.base, env }));
    expect(err!.code).toBe("FAILED");
    expect(err!.message).toMatch(/404/);
  }, 30_000);

  it("allows two at once and tells the third to wait", async () => {
    const [a, b, c] = await Promise.all([1, 2, 3].map((n) => rejection(renderPdf(`${app.base}/slow?n=${n}`, { base: app.base, env }))));
    const codes = [a, b, c].map((e) => e?.code ?? "OK");
    expect(codes.filter((x) => x === "OK")).toHaveLength(2);
    expect(codes.filter((x) => x === "BUSY")).toHaveLength(1);
  }, 60_000);

  it("never leaks a slot: failed launches and failed pages do not use up the limit", async () => {
    const notAChrome = fs.existsSync("/bin/true") ? "/bin/true" : "/usr/bin/true";
    for (let i = 0; i < 4; i++) {
      const err = await rejection(renderPdf(`${app.base}/ok`, { base: app.base, env: { PDF_CHROMIUM_PATH: notAChrome } }));
      expect(err!.code).toBe("FAILED"); // the launch fails after the slot was taken
    }
    for (let i = 0; i < 3; i++) expect((await rejection(renderPdf(`${app.base}/missing`, { base: app.base, env }))!)?.code).toBe("FAILED");
    // If any of those had leaked, two concurrent good renders could not both succeed now.
    const results = await Promise.all([renderPdf(`${app.base}/ok`, { base: app.base, env }), renderPdf(`${app.base}/ok`, { base: app.base, env })]);
    expect(results.every((r) => r.subarray(0, 5).toString() === "%PDF-")).toBe(true);
    expect(launched).toBeGreaterThan(0);
  }, 120_000);
});
