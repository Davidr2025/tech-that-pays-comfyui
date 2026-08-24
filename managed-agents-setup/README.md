# Managed Agents setup (Run Skills pilot)

One-time setup for the "Run Skills" button on the Vision Board. This is
separate from `skills-relay/` (the earlier local-relay approach) -- this
pilot runs entirely in Anthropic's cloud via
[Managed Agents](https://platform.claude.com/docs/en/managed-agents/overview),
so nothing needs to run on your machine day-to-day.

## What this does

`setup-customer-engine-builder.mjs`:
1. Zips your actual `customer-engine-builder/SKILL.md` -- unmodified --
   and uploads it to Anthropic's Skills API.
2. Creates a Managed Agent that attaches that skill.
3. Creates the cloud environment sessions will run in.

The original skill file is never edited -- it's uploaded byte-for-byte,
so it stays exactly what you and Claude Code already use interactively.

## Run it

```
cd managed-agents-setup
ANTHROPIC_API_KEY=sk-ant-... node setup-customer-engine-builder.mjs
```

Uses your own Anthropic API key, on your own machine -- it's never sent
anywhere but Anthropic's API, and never reaches this repo or this chat.
If your skill files aren't at the default
`~/.claude/skills/synced/customer-engine-builder`, pass the real path as
an argument.

It prints three values at the end:

```
ANTHROPIC_API_KEY=...
MANAGED_AGENT_ID=agent_...
MANAGED_AGENT_ENV_ID=env_...
```

Add all three to the `ceo-dashboard` Vercel project's environment
variables, then redeploy. That's it -- the Vision Board's "Run Skills"
section will pick them up automatically.

## Why only one script, one skill

This is a pilot: `receipts`, `research`, and `start-production` each need
their own MCP server + OAuth credential (Google Drive, VidIQ, etc.) wired
into a vault before they can run this way -- real setup work, done one
skill at a time, not part of this pass. `customer-engine-builder` needs
none of that, which is why it's first: it proves the plumbing (button →
cloud session → your real skill file → result) works before we take on
the harder credential wiring for the other three.

## Re-running

Safe to re-run any time you want a fresh agent (e.g. after editing the
skill file and wanting the update reflected) -- it always creates a new
skill + agent + environment rather than modifying existing ones. Update
the Vercel env vars with the new IDs afterward.
