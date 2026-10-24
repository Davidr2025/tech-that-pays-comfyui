/**
 * Chooses the provider for a consultant and wraps Claude so that nothing it does can break the app:
 * a failed, refused, truncated, invalid or rate-limited call logs ONE warning (a reason, never transcript text or
 * the key) and the rule-based result is used instead, marked `fellBack`.
 */
import { MAX_NEW_SEGMENTS } from "../../lib/ai/ground";
import { mockProvider } from "../../lib/ai/mock-provider";
import { AIProviderError, PROVIDER_IDS, type AIProvider, type ProviderId } from "../../lib/ai/types";
import { makeLimiter, type Limiter } from "../../lib/auth/rate-limit";
import { claudeConfigured, claudeProvider } from "./claude";

const HOUR = 60 * 60 * 1000;

/** Model windows a consultant may spend per hour. In memory, so per server process. */
const LIVE_PER_HOUR = 600;
const REVIEW_PER_HOUR = 200;

const limits: { live: Limiter; review: Limiter } = {
  live: makeLimiter({ max: LIVE_PER_HOUR, windowMs: HOUR }),
  review: makeLimiter({ max: REVIEW_PER_HOUR, windowMs: HOUR }),
};

/** Test hook: forget all usage, optionally with smaller allowances. */
export function resetAILimits(live = LIVE_PER_HOUR, review = REVIEW_PER_HOUR) {
  limits.live = makeLimiter({ max: live, windowMs: HOUR });
  limits.review = makeLimiter({ max: review, windowMs: HOUR });
}

export function isProviderId(v: unknown): v is ProviderId {
  return typeof v === "string" && (PROVIDER_IDS as readonly string[]).includes(v);
}

function take(limiter: Limiter, key: string, units: number) {
  if (limiter.retryAfter(key) > 0) throw new AIProviderError("LIMIT", "The hourly limit for Claude calls has been reached.");
  for (let i = 0; i < units; i++) limiter.fail(key);
}

function warn(what: string, err: unknown) {
  const reason = err instanceof AIProviderError ? `${err.reason}: ${err.message}` : "unexpected error";
  console.warn(`[ai] ${what}: using the rule-based result instead (${reason})`);
}

/** Claude first; on ANY failure, the mock. */
function withFallback(primary: AIProvider, consultantId: string): AIProvider {
  return {
    id: primary.id,
    async analyzeTranscript(req) {
      try {
        const units = Math.ceil(Math.max(0, req.segments.length - req.seen) / MAX_NEW_SEGMENTS);
        if (units > 0) take(limits.live, consultantId, units);
        return await primary.analyzeTranscript(req);
      } catch (err) {
        warn("live analysis", err);
        const result = await mockProvider.analyzeTranscript(req);
        return { ...result, fellBack: true, seen: req.seen, state: req.state };
      }
    },
    async generateReveal(input) {
      try {
        take(limits.review, consultantId, 1);
        return await primary.generateReveal(input);
      } catch (err) {
        warn("client review wording", err);
        return { ...(await mockProvider.generateReveal(input)), fellBack: true };
      }
    },
    async generatePrototype(input) {
      try {
        take(limits.review, consultantId, 1);
        return await primary.generatePrototype(input);
      } catch (err) {
        warn("prototype content", err);
        return { ...(await mockProvider.generatePrototype(input)), fellBack: true };
      }
    },
  };
}

/**
 * The provider this consultant gets. Claude only when they chose it AND the server has a key; otherwise the mock,
 * which is also what a consultant who chose Claude gets if the key is later removed.
 */
export function resolveProvider(consultant: { id: string; aiProvider: string }): AIProvider {
  if (consultant.aiProvider === "claude" && claudeConfigured()) return withFallback(claudeProvider, consultant.id);
  return mockProvider;
}
