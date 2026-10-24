/**
 * ClaudeAIProvider: the only place the app talks to the Anthropic API.
 *
 * - The key is read from the server's environment and nowhere else; it is never stored, logged or sent to a browser.
 * - Every answer is requested as structured JSON and then validated again by this app (see ../../lib/ai/*).
 * - A malformed or truncated answer is retried ONCE; after that the call throws AIProviderError and the caller
 *   (provider.ts) uses the rule-based result instead. Errors never include transcript text or the key.
 * - A live call carries only the NEW segments, a few earlier lines for context, and a summary of what is known.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { applyDelta, CONTEXT_SEGMENTS, MAX_NEW_SEGMENTS, toAnalysis } from "../../lib/ai/ground";
import { RejectedText } from "../../lib/ai/guards";
import { applyPrototypeContent } from "../../lib/ai/prototype-content";
import { prototypeMessage, liveAnalysisMessage, PROTOTYPE_SYSTEM, revealMessage, REVEAL_SYSTEM, LIVE_ANALYSIS_SYSTEM } from "../../lib/ai/prompts";
import { applyNarrative } from "../../lib/ai/reveal-narrative";
import { deltaSchema, emptyState, narrativeSchema, prototypeOutSchema, type AnalysisState } from "../../lib/ai/schemas";
import { AIProviderError, type AIProvider } from "../../lib/ai/types";
import { generatePrototype } from "../../lib/prototype/generate";
import { buildRevealData } from "../../lib/reveal/build";

export const DEFAULT_MODEL = "claude-opus-5-5";

/** True when this server has a key to call Claude with. Reads only the presence of the variable. */
export function claudeConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.ANTHROPIC_API_KEY?.trim());
}

export function claudeModel(env: NodeJS.ProcessEnv = process.env): string {
  const m = env.ANTHROPIC_MODEL?.trim();
  return m && /^claude-[a-z0-9.-]+$/.test(m) ? m : DEFAULT_MODEL;
}

type Effort = "low" | "medium" | "high";

interface Ask<S extends z.ZodType> {
  system: string;
  user: string;
  schema: S;
  maxTokens: number;
  effort: Effort;
  timeoutMs: number;
}

let cached: { key: string; baseURL: string | undefined; client: Anthropic } | null = null;

function client(env: NodeJS.ProcessEnv = process.env): Anthropic {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new AIProviderError("UNCONFIGURED", "No ANTHROPIC_API_KEY is configured on this server.");
  const baseURL = env.ANTHROPIC_BASE_URL?.trim() || undefined;
  if (!cached || cached.key !== apiKey || cached.baseURL !== baseURL) {
    // The SDK retries connection errors, 408/409/429 and 5xx on its own; one retry here, our own retry is for bad JSON.
    cached = { key: apiKey, baseURL, client: new Anthropic({ apiKey, baseURL, maxRetries: 1 }) };
  }
  return cached.client;
}

/** One request. Throws AIProviderError with a reason; the message never contains transcript text. */
async function once<S extends z.ZodType>(a: Ask<S>): Promise<z.infer<S>> {
  let response;
  try {
    response = await client().messages.parse(
      {
        model: claudeModel(),
        max_tokens: a.maxTokens,
        system: a.system,
        messages: [{ role: "user", content: a.user }],
        output_config: { format: zodOutputFormat(a.schema), effort: a.effort },
      },
      { timeout: a.timeoutMs },
    );
  } catch (err) {
    if (err instanceof AIProviderError) throw err;
    if (err instanceof Anthropic.APIError) throw new AIProviderError("REQUEST", `Anthropic API error (${err.status ?? "network"}).`);
    // The SDK parses the answer with our schema; a bad answer surfaces here as a parse error.
    throw new AIProviderError("INVALID", "The answer did not match the expected shape.");
  }
  if (response.stop_reason === "refusal") throw new AIProviderError("REFUSED", "The model declined this request.");
  if (response.stop_reason === "max_tokens") throw new AIProviderError("TRUNCATED", "The answer was cut off.");
  if (response.parsed_output == null) throw new AIProviderError("INVALID", "The answer did not match the expected shape.");
  return response.parsed_output as z.infer<S>;
}

/** Asks, and on a malformed or truncated answer asks exactly once more. */
async function ask<S extends z.ZodType>(a: Ask<S>): Promise<z.infer<S>> {
  try {
    return await once(a);
  } catch (err) {
    if (err instanceof AIProviderError && (err.reason === "INVALID" || err.reason === "TRUNCATED")) return once(a);
    throw err;
  }
}

export const claudeProvider: AIProvider = {
  id: "claude",

  async analyzeTranscript(req) {
    const upTo = req.segments.length;
    let state: AnalysisState = req.state ?? emptyState();
    let seen = Math.min(req.seen, upTo);
    const allowed = new Set(req.questions.map((q) => q.topic));

    // A long backlog (a pasted transcript, a review of a call that was never analysed live) goes in windows of
    // MAX_NEW_SEGMENTS new lines, each carrying the findings so far: never the whole transcript again.
    while (seen < upTo) {
      const next = Math.min(upTo, seen + MAX_NEW_SEGMENTS);
      const delta = await ask({
        system: LIVE_ANALYSIS_SYSTEM,
        user: liveAnalysisMessage({
          sessionType: req.type,
          questions: req.questions,
          state,
          context: req.segments.slice(Math.max(0, seen - CONTEXT_SEGMENTS), seen),
          newSegments: req.segments.slice(seen, next),
        }),
        schema: deltaSchema,
        maxTokens: 8000,
        effort: "low",
        timeoutMs: 60_000,
      });
      // Only the lines sent so far can have been quoted: later lines were not.
      state = applyDelta(state, delta, req.segments.slice(0, next), allowed).state;
      seen = next;
    }
    return { provider: "claude", fellBack: false, analysis: toAnalysis(state, req.segments, req.type), state, seen };
  },

  async generateReveal(input) {
    const base = buildRevealData(input);
    if (base.painPoints.length === 0) return { provider: "claude", fellBack: false, value: base };
    const narrative = await ask({ system: REVEAL_SYSTEM, user: revealMessage(base), schema: narrativeSchema, maxTokens: 8000, effort: "medium", timeoutMs: 90_000 });
    try {
      return { provider: "claude", fellBack: false, value: applyNarrative(base, narrative) };
    } catch (err) {
      if (err instanceof RejectedText) throw new AIProviderError("INVALID", `The reveal wording was rejected: ${err.why}.`);
      throw err;
    }
  },

  async generatePrototype(input) {
    const base = generatePrototype(input);
    const out = await ask({ system: PROTOTYPE_SYSTEM, user: prototypeMessage(input), schema: prototypeOutSchema, maxTokens: 12000, effort: "medium", timeoutMs: 120_000 });
    try {
      return { provider: "claude", fellBack: false, value: applyPrototypeContent(out, base, input) };
    } catch (err) {
      if (err instanceof RejectedText) throw new AIProviderError("INVALID", `The prototype content was rejected: ${err.why}.`);
      throw err;
    }
  },
};
