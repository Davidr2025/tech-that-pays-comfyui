import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FetchFailedError, isPrivateAddress, parseHttpUrl, safeFetchText, UnsafeUrlError } from "@/server/safe-fetch";

describe("isPrivateAddress", () => {
  it.each([
    "127.0.0.1", "127.255.255.254", "10.0.0.1", "10.255.255.255", "172.16.0.1", "172.31.255.255", "192.168.1.1",
    "169.254.169.254", "0.0.0.0", "100.64.0.1", "198.18.0.1", "224.0.0.1", "255.255.255.255", "::1", "::",
    "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:10.1.2.3", "::ffff:7f00:1", "::ffff:a9fe:a9fe",
  ])("blocks %s", (ip) => expect(isPrivateAddress(ip)).toBe(true));

  it.each(["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.15.255.255", "172.32.0.1", "192.169.0.1", "100.63.255.255", "2606:4700:4700::1111", "::ffff:8.8.8.8"])(
    "allows public %s",
    (ip) => expect(isPrivateAddress(ip)).toBe(false),
  );

  it("refuses anything that is not an IP", () => {
    expect(isPrivateAddress("not-an-ip")).toBe(true);
    expect(isPrivateAddress("")).toBe(true);
  });
});

describe("parseHttpUrl", () => {
  it("adds https:// to a bare domain", () => {
    expect(parseHttpUrl("brightline.example").toString()).toBe("https://brightline.example/");
    expect(parseHttpUrl("  http://brightline.example/about ").protocol).toBe("http:");
  });

  it.each(["ftp://x.example", "file:///etc/passwd", "javascript:alert(1)", "gopher://x.example", "data:text/html,hi"])("rejects scheme in %s", (u) =>
    expect(() => parseHttpUrl(u)).toThrow(UnsafeUrlError),
  );

  it("rejects credentials, odd ports and hostless input", () => {
    expect(() => parseHttpUrl("https://user:pass@x.example")).toThrow(/username or password/);
    expect(() => parseHttpUrl("https://x.example:8080")).toThrow(/standard web ports/);
    expect(() => parseHttpUrl("https://x.example:5432")).toThrow(UnsafeUrlError);
    expect(() => parseHttpUrl("https://")).toThrow(UnsafeUrlError);
    expect(parseHttpUrl("https://x.example:443").hostname).toBe("x.example");
  });
});

describe("safeFetchText against a real local server", () => {
  let server: http.Server;
  let base: string;
  let port: string;
  const allowLoopback = (ip: string) => ip === "127.0.0.1" || ip === "::1";

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const path = req.url ?? "/";
      if (path === "/ok") res.writeHead(200, { "content-type": "text/html" }).end("<html>hello</html>");
      else if (path === "/big") res.writeHead(200, { "content-type": "text/html" }).end("x".repeat(50_000));
      else if (path === "/image") res.writeHead(200, { "content-type": "image/png" }).end("PNG");
      else if (path === "/missing") res.writeHead(404, { "content-type": "text/html" }).end("no");
      else if (path === "/r1") res.writeHead(302, { location: "/r2" }).end();
      else if (path === "/r2") res.writeHead(302, { location: "/ok" }).end();
      else if (path === "/loop") res.writeHead(302, { location: "/loop" }).end();
      else if (path === "/to-metadata") res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" }).end();
      else if (path === "/to-file") res.writeHead(302, { location: "file:///etc/passwd" }).end();
      else if (path === "/hang") { /* never answers */ }
      else res.writeHead(404).end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = String((server.address() as AddressInfo).port);
    base = `http://127.0.0.1:${port}`;
  });
  afterAll(() => {
    server.closeAllConnections();
    server.close();
  });

  const open = { isAllowedAddress: allowLoopback, allowedPorts: [] as string[] };
  const opts = () => ({ ...open, allowedPorts: [port] });

  it("fetches a page when its address is allowed", async () => {
    const r = await safeFetchText(`${base}/ok`, opts());
    expect(r.body).toBe("<html>hello</html>");
    expect(r.url).toBe(`${base}/ok`);
  });

  it("BLOCKS the same page by default: a literal loopback IP", async () => {
    await expect(safeFetchText(`${base}/ok`, { allowedPorts: [port] })).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("BLOCKS a hostname that resolves to loopback, at connect time", async () => {
    await expect(safeFetchText(`http://localhost:${port}/ok`, { allowedPorts: [port] })).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("blocks a redirect that points at the cloud metadata address", async () => {
    await expect(safeFetchText(`${base}/to-metadata`, opts())).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("refuses a redirect to a non-http scheme", async () => {
    await expect(safeFetchText(`${base}/to-file`, opts())).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("follows a short redirect chain but gives up on a loop", async () => {
    expect((await safeFetchText(`${base}/r1`, opts())).body).toContain("hello");
    await expect(safeFetchText(`${base}/loop`, opts())).rejects.toThrow(/too many times/);
    await expect(safeFetchText(`${base}/r1`, { ...opts(), maxRedirects: 1 })).rejects.toThrow(/too many times/);
  });

  it("enforces the size cap", async () => {
    await expect(safeFetchText(`${base}/big`, { ...opts(), maxBytes: 1_000 })).rejects.toThrow(/too large/);
    expect((await safeFetchText(`${base}/big`, { ...opts(), maxBytes: 100_000 })).body).toHaveLength(50_000);
  });

  it("rejects non-text responses and error statuses", async () => {
    await expect(safeFetchText(`${base}/image`, opts())).rejects.toThrow(/did not return a web page/);
    await expect(safeFetchText(`${base}/missing`, opts())).rejects.toThrow(/status 404/);
  });

  it("times out a server that never answers", async () => {
    await expect(safeFetchText(`${base}/hang`, { ...opts(), timeoutMs: 250 })).rejects.toBeInstanceOf(FetchFailedError);
  });
});
