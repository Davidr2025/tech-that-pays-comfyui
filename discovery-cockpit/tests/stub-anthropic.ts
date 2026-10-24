/**
 * A local stand-in for the Anthropic Messages API, so the real SDK code path (request building, structured-output
 * parsing, retries, error classes) runs in tests without a key or a network. It speaks just enough of the wire format.
 *
 * It proves the APP's behaviour; it cannot prove the real service accepts our request shape. Verifying that needs a
 * real key (see the README).
 */
import http from "node:http";
import type { AddressInfo } from "node:net";

export interface Recorded {
  path: string;
  headers: http.IncomingHttpHeaders;
  body: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export type Reply = { status?: number; headers?: Record<string, string>; body: unknown };

/** A well-formed Messages response whose single text block is `text`. */
export const message = (text: string, stop_reason = "end_turn"): Reply => ({
  body: {
    id: "msg_stub",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: [{ type: "text", text }],
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
  },
});

export const json = (value: unknown, stop_reason = "end_turn"): Reply => message(JSON.stringify(value), stop_reason);

export const apiError = (status: number, type = "api_error"): Reply => ({
  status,
  headers: { "retry-after": "0" },
  body: { type: "error", error: { type, message: "stub error" } },
});

export async function startStub() {
  const requests: Recorded[] = [];
  let script: (r: Recorded) => Reply = () => apiError(500);

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      let body: Recorded["body"] = {};
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      } catch {
        /* leave empty */
      }
      const recorded = { path: req.url ?? "", headers: req.headers, body };
      requests.push(recorded);
      const reply = script(recorded);
      res.writeHead(reply.status ?? 200, { "content-type": "application/json", ...reply.headers });
      res.end(JSON.stringify(reply.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    url,
    requests,
    /** Replies come from this function, called once per request. */
    reply(fn: (r: Recorded) => Reply) {
      script = fn;
    },
    /** Replies in order; the last one repeats. */
    queue(...replies: Reply[]) {
      let i = 0;
      script = () => replies[Math.min(i++, replies.length - 1)]!;
    },
    reset() {
      requests.length = 0;
      script = () => apiError(500);
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
