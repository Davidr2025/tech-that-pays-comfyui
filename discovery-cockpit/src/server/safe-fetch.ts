/**
 * Fetching a user-supplied URL from a server is a classic SSRF hole: "https://169.254.169.254/",
 * "http://localhost:5432" or a hostname that resolves to a private address would let a client of
 * this app read the host's internal network. This module fetches only public http(s) pages:
 *
 *  - scheme must be http(s), standard ports only, no credentials in the URL;
 *  - the address is checked AT CONNECT TIME (a custom `lookup`), so a hostname that resolves
 *    differently between a pre-check and the connection (DNS rebinding) is still caught;
 *  - redirects are followed by hand, a few hops at most, each hop re-validated;
 *  - the response is size-capped, time-limited, requested uncompressed (no decompression bombs),
 *    and must be text.
 */
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";

export class UnsafeUrlError extends Error {}
export class FetchFailedError extends Error {}

export function parseHttpUrl(input: string, allowedPorts: readonly string[] = ["80", "443"]): URL {
  const trimmed = input.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new UnsafeUrlError("That doesn't look like a web address.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new UnsafeUrlError("Only http and https addresses are allowed.");
  if (url.username || url.password) throw new UnsafeUrlError("Addresses with a username or password are not allowed.");
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  if (!allowedPorts.includes(port)) throw new UnsafeUrlError("Only the standard web ports (80 and 443) are allowed.");
  if (!url.hostname) throw new UnsafeUrlError("That web address has no host.");
  return url;
}

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((n, part) => n * 256 + Number(part), 0);
}

const V4_BLOCKS: [string, number][] = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, cloud metadata
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15], // benchmarking
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];

/** True for any address a public website would never legitimately resolve to. */
export function isPrivateAddress(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) {
    const n = ipv4ToInt(ip);
    return V4_BLOCKS.some(([base, bits]) => {
      const size = 2 ** (32 - bits);
      const start = Math.floor(ipv4ToInt(base) / size) * size;
      return n >= start && n < start + size;
    });
  }
  if (kind === 6) {
    const lower = ip.toLowerCase();
    const mapped = lower.match(/^(?:::ffff:|0:0:0:0:0:ffff:)(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]!);
    const hex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) {
      const hi = parseInt(hex[1]!, 16);
      const lo = parseInt(hex[2]!, 16);
      return isPrivateAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    if (lower === "::" || lower === "::1") return true;
    const first = parseInt(lower.split(":")[0] || "0", 16);
    return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00; // ULA, link-local, multicast
  }
  return true; // not an IP at all: refuse
}

export interface SafeFetchOptions {
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  /** Which resolved addresses may be connected to. Default: public addresses only. Tests override. */
  isAllowedAddress?: (ip: string) => boolean;
  /** Ports that may be fetched. Default 80 and 443 only. Tests override this to use a local server. */
  allowedPorts?: readonly string[];
}

const TEXT_TYPES = /^(text\/|application\/(xhtml\+xml|xml|json|javascript)\b)/i;

function makeLookup(isAllowed: (ip: string) => boolean): net.LookupFunction {
  return (hostname, options, callback) => {
    dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, "", 0);
      const list = Array.isArray(addresses) ? addresses : [];
      const bad = list.find((a) => !isAllowed(a.address));
      if (bad || list.length === 0) return callback(new UnsafeUrlError("That address points to a private or internal network."), "", 0);
      const first = list[0]!;
      if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: typeof list) => void)(null, list);
      callback(null, first.address, first.family);
    });
  };
}

function requestOnce(url: URL, opts: Required<SafeFetchOptions>): Promise<{ status: number; location: string | null; contentType: string; body: string }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = <T,>(fn: (v: T) => void, v: T) => {
      if (settled) return;
      settled = true;
      fn(v);
    };
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      url,
      {
        method: "GET",
        lookup: makeLookup(opts.isAllowedAddress),
        headers: { "User-Agent": "DiscoveryCockpit/0.1 (brand colour check)", Accept: "text/html,text/css;q=0.9,*/*;q=0.1", "Accept-Encoding": "identity" },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = (res.headers.location as string | undefined) ?? null;
        const contentType = String(res.headers["content-type"] ?? "");
        const fail = (err: Error) => {
          finish(reject, err);
          req.destroy();
        };
        if (status >= 300 && status < 400) {
          res.resume();
          return finish(resolve, { status, location, contentType, body: "" });
        }
        if (status < 200 || status >= 300) return fail(new FetchFailedError(`The site answered with status ${status}.`));
        if (!TEXT_TYPES.test(contentType)) return fail(new FetchFailedError("That address did not return a web page."));
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          if (settled) return;
          size += c.length;
          if (size > opts.maxBytes) return fail(new FetchFailedError("That page is too large to check."));
          chunks.push(c);
        });
        res.on("end", () => finish(resolve, { status, location: null, contentType, body: Buffer.concat(chunks).toString("utf8") }));
        res.on("error", (err) => finish(reject, cause(err)));
      },
    );
    req.setTimeout(opts.timeoutMs, () => {
      finish(reject, new FetchFailedError("The site took too long to answer."));
      req.destroy();
    });
    req.on("error", (err) => finish(reject, err instanceof UnsafeUrlError || err instanceof FetchFailedError ? err : cause(err)));
    req.end();
  });
}

function cause(err: unknown): Error {
  const inner = (err as { cause?: unknown })?.cause;
  if (inner instanceof UnsafeUrlError) return inner;
  const msg = err instanceof Error ? err.message : "";
  if (/UnsafeUrlError|private or internal/.test(msg)) return new UnsafeUrlError("That address points to a private or internal network.");
  return new FetchFailedError("Could not reach that site.");
}

export async function safeFetchText(input: string, options: SafeFetchOptions = {}): Promise<{ url: string; body: string }> {
  const opts: Required<SafeFetchOptions> = {
    maxBytes: options.maxBytes ?? 1_000_000,
    timeoutMs: options.timeoutMs ?? 8_000,
    maxRedirects: options.maxRedirects ?? 4,
    isAllowedAddress: options.isAllowedAddress ?? ((ip) => !isPrivateAddress(ip)),
    allowedPorts: options.allowedPorts ?? ["80", "443"],
  };
  let url = parseHttpUrl(input, opts.allowedPorts);
  // A literal IP in the URL never reaches `lookup`, so check it here.
  for (let hop = 0; hop <= opts.maxRedirects; hop++) {
    if (net.isIP(url.hostname.replace(/^\[|\]$/g, "")) && !opts.isAllowedAddress(url.hostname.replace(/^\[|\]$/g, ""))) {
      throw new UnsafeUrlError("That address points to a private or internal network.");
    }
    const res = await requestOnce(url, opts);
    if (res.status >= 300 && res.status < 400) {
      if (!res.location) throw new FetchFailedError("The site redirected without saying where.");
      url = parseHttpUrl(new URL(res.location, url).toString(), opts.allowedPorts);
      continue;
    }
    return { url: url.toString(), body: res.body };
  }
  throw new FetchFailedError("The site redirected too many times.");
}
