// One-time setup: uploads the *actual, unmodified* customer-engine-builder
// SKILL.md to Anthropic's Skills API, creates a Managed Agent that attaches
// it, and creates the cloud environment sessions will run in.
//
// Run this LOCALLY, with your own API key -- it never needs to leave your
// machine or reach this repo. Vision Board's runtime code only ever
// references the agent_id / environment_id this prints, never your key.
//
//   ANTHROPIC_API_KEY=sk-ant-... node setup-customer-engine-builder.mjs
//
// Optionally pass the skill's directory as an argument if it's not at the
// default location:
//
//   ANTHROPIC_API_KEY=sk-ant-... node setup-customer-engine-builder.mjs /path/to/customer-engine-builder
//
// Requires the `zip` command-line tool (present by default on macOS/Linux).

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error("Set ANTHROPIC_API_KEY first -- your own key, used only by this script, on this machine.");
  process.exit(1);
}

const SKILL_DIR = process.argv[2] || path.join(os.homedir(), ".claude/skills/synced/customer-engine-builder");
const SKILL_MD = path.join(SKILL_DIR, "SKILL.md");
if (!fs.existsSync(SKILL_MD)) {
  console.error(`No SKILL.md found at ${SKILL_MD}.`);
  console.error("Pass the skill's directory as an argument if it lives elsewhere.");
  process.exit(1);
}

const ZIP_PATH = path.join(os.tmpdir(), "customer-engine-builder.zip");
if (fs.existsSync(ZIP_PATH)) fs.rmSync(ZIP_PATH);

console.log(`Zipping ${SKILL_DIR} (unmodified) ...`);
execSync(`cd "${path.dirname(SKILL_DIR)}" && zip -rq "${ZIP_PATH}" "${path.basename(SKILL_DIR)}"`, { stdio: "inherit" });

const BASE_HEADERS = { "x-api-key": API_KEY, "anthropic-version": "2023-06-01" };

async function main() {
  console.log("Uploading skill to the Skills API ...");
  const form = new FormData();
  form.append("files[]", new Blob([fs.readFileSync(ZIP_PATH)]), "customer-engine-builder.zip");
  const skillRes = await fetch("https://api.anthropic.com/v1/skills", {
    method: "POST",
    headers: { ...BASE_HEADERS, "anthropic-beta": "skills-2025-10-02" },
    body: form
  });
  if (!skillRes.ok) throw new Error(`Skill upload failed (${skillRes.status}): ${await skillRes.text()}`);
  const skill = await skillRes.json();
  console.log(`Skill created: ${skill.id}`);

  console.log("Creating the Managed Agent ...");
  const agentRes = await fetch("https://api.anthropic.com/v1/agents", {
    method: "POST",
    headers: { ...BASE_HEADERS, "content-type": "application/json", "anthropic-beta": "managed-agents-2026-04-01" },
    body: JSON.stringify({
      name: "Customer Engine Builder (Vision Board pilot)",
      model: "claude-opus-5",
      system: "When given a task, use the attached customer-engine-builder skill to complete it.",
      tools: [{ type: "agent_toolset_20260401" }],
      skills: [{ type: "custom", skill_id: skill.id, version: "latest" }]
    })
  });
  if (!agentRes.ok) throw new Error(`Agent creation failed (${agentRes.status}): ${await agentRes.text()}`);
  const agent = await agentRes.json();
  console.log(`Agent created: ${agent.id}`);

  console.log("Creating the environment ...");
  const envRes = await fetch("https://api.anthropic.com/v1/environments", {
    method: "POST",
    headers: { ...BASE_HEADERS, "content-type": "application/json", "anthropic-beta": "managed-agents-2026-04-01" },
    body: JSON.stringify({
      name: "Vision Board skills pilot",
      config: { type: "cloud", networking: { type: "unrestricted" } }
    })
  });
  if (!envRes.ok) throw new Error(`Environment creation failed (${envRes.status}): ${await envRes.text()}`);
  const env = await envRes.json();
  console.log(`Environment created: ${env.id}`);

  console.log("\nDone. Add these to the ceo-dashboard Vercel project's environment variables:\n");
  console.log(`ANTHROPIC_API_KEY=<the same key you just used to run this script>`);
  console.log(`MANAGED_AGENT_ID=${agent.id}`);
  console.log(`MANAGED_AGENT_ENV_ID=${env.id}`);
  console.log("\nThen redeploy so the Vision Board picks up the new env vars.");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
