import { requestIsAuthed } from "../lib/auth.js";
import { logActivity } from "../lib/airtable.js";

export const config = { runtime: "edge" };

const ANTHROPIC_BETA = "managed-agents-2026-04-01";

// Pilot: only this one skill is wired up. receipts/research/start-production
// each need their own MCP server + vault credential (Google Drive, VidIQ,
// Airtable) before they can run this way -- separate follow-up work.
const SKILLS = {
  "customer-engine-builder": { label: "Customer Engine Builder", requiresInput: true }
};

export default async function handler(request) {
  if (!(await requestIsAuthed(request, process.env.SESSION_SECRET))) {
    return json({ error: "Not signed in" }, 401);
  }
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const agentId = process.env.MANAGED_AGENT_ID;
  const environmentId = process.env.MANAGED_AGENT_ENV_ID;
  if (!apiKey || !agentId || !environmentId) {
    return json({ error: "Managed Agents isn't configured yet (ANTHROPIC_API_KEY / MANAGED_AGENT_ID / MANAGED_AGENT_ENV_ID) -- see managed-agents-setup/README.md" }, 503);
  }

  const body = await request.json();
  const skill = SKILLS[body.skill];
  if (!skill) return json({ error: "Unknown or not-yet-available skill" }, 400);

  const input = (body.input || "").trim();
  if (skill.requiresInput && !input) {
    return json({ error: `${skill.label} needs a description of what to build` }, 400);
  }

  let res;
  try {
    res = await fetch("https://api.anthropic.com/v1/sessions", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": ANTHROPIC_BETA,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        agent: agentId,
        environment_id: environmentId,
        title: `Vision Board: ${skill.label}`,
        initial_events: [{ type: "user.message", content: [{ type: "text", text: input }] }]
      })
    });
  } catch (err) {
    return json({ error: `Couldn't reach the Managed Agents API: ${err.message}` }, 502);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return json({ error: `Session create failed (${res.status}): ${text}` }, 502);
  }

  const session = await res.json();
  await logActivity(`Ran skill: ${skill.label} (${input.slice(0, 60)}${input.length > 60 ? "…" : ""})`, "Skill");
  return json({ sessionId: session.id, consoleUrl: consoleUrl(session.id) }, 201);
}

function consoleUrl(sessionId) {
  return `https://platform.claude.com/workspaces/default/sessions/${sessionId}`;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
