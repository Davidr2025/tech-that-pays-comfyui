/** Sentences from the demo call, and a model answer built from them. Shared by the AI tests. */
import { deltaSchema, type Delta } from "@/lib/ai/schemas";

export const REPORT_FIGURE = "It's easily ten to twelve hours a week, and if she's sick, nobody else knows the process.";
export const UPWORK = "And we pay a contractor on Upwork roughly $4,000 a month to help with the reporting overflow.";
export const HUBSPOT = "HubSpot is the big one — about $800 a month for the Marketing Hub, and honestly we use maybe a third of it.";
export const URGENCY = "Timeline-wise, the dental group wants their first proper report by mid-November, so I'd want to move in the next two to three weeks if we do this.";
export const SOLE = "It's just me, honestly.";
export const CONSULTANT_LINE = "Two days a week on reporting.";

export function delta(over: Partial<Delta> = {}): Delta {
  return deltaSchema.parse({
    painPoints: [
      { category: "manual_reporting", quote: "Last month a report went out with the wrong month's numbers and the client spotted it before we did.", figureQuote: REPORT_FIGURE, severity: "high" },
      { category: "outsourcing_cost", quote: UPWORK, figureQuote: UPWORK, severity: "high" },
    ],
    signals: [],
    objections: [],
    techStack: [{ tool: "HubSpot", purpose: "CRM and marketing", costQuote: HUBSPOT }],
    facts: { budgetQuote: null, urgencyQuote: URGENCY, decisionQuote: SOLE, decisionRole: "maker" },
    questionsCovered: ["time_sinks", "tool_stack"],
    decisionReadiness: { score: 70, reason: "Sole decision-maker with a hard date." },
    reflectBackSummary: "I hear that reporting is eating your week and the contractor spend hurts.",
    suggestedNextQuestion: { text: "What is one recovered lead worth to you?", why: "Puts a dollar value on slow follow-up." },
    ...over,
  });
}

