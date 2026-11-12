/**
 * Sends a note-taker bot to a Zoom / Google Meet / Teams call through Recall.ai, which then posts each finished
 * sentence to this session's live-ingest URL. Optional: only when RECALL_API_KEY is set on the server.
 *
 * UNVERIFIED AGAINST THE REAL SERVICE: written from Recall's public API description without a key to test with.
 * Errors are logged with a status code only, never returned to the browser and never with the key.
 */
const REGIONS = new Set(["us-west-2", "us-east-1", "eu-central-1", "ap-northeast-1"]);
const MEETING_HOSTS = /(^|\.)(zoom\.us|zoom\.com|meet\.google\.com|teams\.microsoft\.com|teams\.live\.com|webex\.com)$/i;

export class RecallError extends Error {
  constructor(
    public code: "INVALID" | "UNAVAILABLE" | "UPSTREAM",
    message: string,
  ) {
    super(message);
  }
}

export const recallConfigured = (env: NodeJS.ProcessEnv = process.env) => Boolean(env.RECALL_API_KEY?.trim());

function base(env: NodeJS.ProcessEnv): string {
  const region = env.RECALL_REGION?.trim() || "us-west-2";
  if (!REGIONS.has(region)) throw new RecallError("UNAVAILABLE", "RECALL_REGION is not a known Recall.ai region.");
  // RECALL_BASE_URL exists for tests only (a local stand-in).
  return env.RECALL_BASE_URL?.trim() || `https://${region}.recall.ai`;
}

/** Where the outside world reaches this app. From configuration only, never from a request header. */
export function publicOrigin(env: NodeJS.ProcessEnv = process.env): string | null {
  const explicit = env.PUBLIC_URL?.trim().replace(/\/+$/, "");
  if (explicit && /^https:\/\//.test(explicit)) return explicit;
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return vercel ? `https://${vercel}` : null;
}

export function meetingUrlProblem(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return "Paste the meeting's https link.";
    if (!MEETING_HOSTS.test(u.hostname)) return "That is not a Zoom, Google Meet, Teams or Webex link.";
    return null;
  } catch {
    return "Paste the full meeting link.";
  }
}

async function call(path: string, body: unknown, env: NodeJS.ProcessEnv): Promise<Record<string, unknown>> {
  const key = env.RECALL_API_KEY?.trim();
  if (!key) throw new RecallError("UNAVAILABLE", "No note-taker service is configured on this server.");
  let res: Response;
  try {
    res = await fetch(`${base(env)}${path}`, {
      method: "POST",
      headers: { Authorization: `Token ${key}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    console.warn("[recall] request failed (network)");
    throw new RecallError("UPSTREAM", "Could not reach the note-taker service.");
  }
  if (!res.ok) {
    console.warn(`[recall] ${path.replace(/[0-9a-f-]{20,}/, ":id")} answered ${res.status}`);
    throw new RecallError("UPSTREAM", `The note-taker service refused the request (${res.status}).`);
  }
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

export async function sendBot(args: { meetingUrl: string; webhookUrl: string; botName: string }, env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const problem = meetingUrlProblem(args.meetingUrl);
  if (problem) throw new RecallError("INVALID", problem);
  // "meeting_captions" uses the meeting's own captions (cheaper); the default is Recall's own transcription.
  const provider = env.RECALL_TRANSCRIPT?.trim() === "meeting_captions" ? { meeting_captions: {} } : { recallai_streaming: {} };
  const json = await call(
    "/api/v1/bot/",
    {
      meeting_url: args.meetingUrl,
      bot_name: args.botName.slice(0, 60),
      recording_config: {
        transcript: { provider },
        realtime_endpoints: [{ type: "webhook", url: args.webhookUrl, events: ["transcript.data"] }],
      },
    },
    env,
  );
  if (typeof json.id !== "string" || !/^[0-9a-f-]{10,60}$/i.test(json.id)) throw new RecallError("UPSTREAM", "The note-taker service gave an answer this app does not understand.");
  return json.id;
}

export async function removeBot(botId: string, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  if (!/^[0-9a-f-]{10,60}$/i.test(botId)) return;
  await call(`/api/v1/bot/${botId}/leave_call/`, {}, env);
}
