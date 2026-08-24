import { requestIsAuthed } from "../lib/auth.js";

export const config = { runtime: "edge" };

const ANTHROPIC_BETA = "managed-agents-2026-04-01";

export default async function handler(request) {
  if (!(await requestIsAuthed(request, process.env.SESSION_SECRET))) {
    return json({ error: "Not signed in" }, 401);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json({ error: "Managed Agents isn't configured yet" }, 503);

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");
  if (!sessionId) return json({ error: "sessionId is required" }, 400);

  const headers = {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "anthropic-beta": ANTHROPIC_BETA
  };

  let sessionRes, eventsRes;
  try {
    [sessionRes, eventsRes] = await Promise.all([
      fetch(`https://api.anthropic.com/v1/sessions/${encodeURIComponent(sessionId)}`, { headers }),
      fetch(`https://api.anthropic.com/v1/sessions/${encodeURIComponent(sessionId)}/events?limit=1000`, { headers })
    ]);
  } catch (err) {
    return json({ error: `Couldn't reach the Managed Agents API: ${err.message}` }, 502);
  }

  if (!sessionRes.ok) {
    const text = await sessionRes.text().catch(() => "");
    return json({ error: `Session fetch failed (${sessionRes.status}): ${text}` }, 502);
  }
  if (!eventsRes.ok) {
    const text = await eventsRes.text().catch(() => "");
    return json({ error: `Events fetch failed (${eventsRes.status}): ${text}` }, 502);
  }

  const session = await sessionRes.json();
  const events = (await eventsRes.json()).data || [];

  const errorEvent = [...events].reverse().find((e) => e.type === "session.error");
  const lastAgentMessage = [...events].reverse().find((e) => e.type === "agent.message");
  const text = lastAgentMessage ? textFromContent(lastAgentMessage.content).slice(0, 4000) : "";

  let status;
  if (errorEvent) status = "failed";
  else if (session.status === "running" || session.status === "rescheduling") status = "running";
  else status = "done"; // idle or terminated

  return json({
    status,
    text,
    consoleUrl: `https://platform.claude.com/workspaces/default/sessions/${sessionId}`,
    error: errorEvent ? errorText(errorEvent) : undefined
  });
}

function textFromContent(content) {
  if (!Array.isArray(content)) return "";
  return content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

function errorText(errorEvent) {
  return errorEvent.message || errorEvent.error?.message || JSON.stringify(errorEvent).slice(0, 500);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
