/**
 * The seam between the app and whatever produces its intelligence. Two implementations:
 *
 *   MockAIProvider    rule-based, deterministic, no network. The default; the demo depends on it.
 *   ClaudeAIProvider  calls the Anthropic API; used only when the consultant picks it AND a key is configured.
 *
 * Everything a provider returns is untrusted until it has passed the same validation the mock's output passes.
 */
import type { GeneratedModule, PrototypeInput } from "../prototype/generate";
import type { RevealData } from "../reveal/schema";
import type { RevealInput } from "../reveal/build";
import type { SessionType } from "../session-types";
import type { Analysis, Segment } from "../mock-ai/types";
import type { AnalysisState } from "./schemas";

export const PROVIDER_IDS = ["mock", "claude"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const PROVIDER_LABELS: Record<ProviderId, string> = { mock: "Mock (rule-based)", claude: "Claude" };

/** Who produced a result. `fellBack` means Claude was asked and the app used the rule-based result instead. */
export interface Provenance {
  provider: ProviderId;
  fellBack: boolean;
}

export interface Produced<T> extends Provenance {
  value: T;
}

export interface AnalyzeRequest {
  type: SessionType;
  /** The session's checklist: the only topics a provider may mark as covered. */
  questions: { topic: string; text: string }[];
  /** The whole transcript so far, in order. A paid provider only SENDS `segments.slice(seen)` plus a little context. */
  segments: Segment[];
  /** How many leading segments `state` already accounts for. */
  seen: number;
  /** What the provider has accumulated so far (null for the mock, and for the first Claude call). */
  state: AnalysisState | null;
}

export interface AnalyzeResult extends Provenance {
  analysis: Analysis;
  /** The provider's accumulated findings, to hand back with the next request. Null when it keeps none. */
  state: AnalysisState | null;
  /** How many leading segments `state` now accounts for. */
  seen: number;
}

export interface AIProvider {
  readonly id: ProviderId;
  analyzeTranscript(req: AnalyzeRequest): Promise<AnalyzeResult>;
  generateReveal(input: RevealInput): Promise<Produced<RevealData>>;
  generatePrototype(input: PrototypeInput): Promise<Produced<GeneratedModule[]>>;
}

/** Thrown by a Claude call that could not produce a valid result; the fallback wrapper turns it into the mock's result. */
export class AIProviderError extends Error {
  constructor(
    public reason: "UNCONFIGURED" | "REQUEST" | "REFUSED" | "TRUNCATED" | "INVALID" | "LIMIT",
    message: string,
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}
