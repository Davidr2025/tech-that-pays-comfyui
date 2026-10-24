import { analyze } from "../mock-ai/engine";
import { generatePrototype } from "../prototype/generate";
import { buildRevealData } from "../reveal/build";
import type { AIProvider } from "./types";

/** The rule-based provider: deterministic, offline, no keys. The demo and every test depend on it. */
export const mockProvider: AIProvider = {
  id: "mock",
  async analyzeTranscript(req) {
    return { provider: "mock", fellBack: false, analysis: analyze(req.segments, { type: req.type }), state: null, seen: req.segments.length };
  },
  async generateReveal(input) {
    return { provider: "mock", fellBack: false, value: buildRevealData(input) };
  },
  async generatePrototype(input) {
    return { provider: "mock", fellBack: false, value: generatePrototype(input) };
  },
};
