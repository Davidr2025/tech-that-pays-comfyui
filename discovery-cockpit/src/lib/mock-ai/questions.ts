/** The three levers every question targets, plus the two call-management stages. */
export type Lever = "context" | "efficiency" | "effectiveness" | "quality" | "decision" | "outcomes";

export interface BankQuestion {
  topic: string;
  text: string;
  lever: Lever;
  /** Coaching hint shown with the "suggested next question". */
  why: string;
}

/**
 * Default discovery question bank, in natural call order (from the Demo Seed Pack).
 * Each question targets effectiveness (more revenue), efficiency (hours back) or quality
 * (better client experience); the first, second-to-last and last frame and close the call.
 */
export const QUESTION_BANK: BankQuestion[] = [
  { topic: "context", lever: "context", text: "Walk me through the business as it runs today — team size, clients, how money comes in.", why: "Frames the call and gets them talking about something easy." },
  { topic: "time_sinks", lever: "efficiency", text: "What are the two or three tasks eating the most hours every week?", why: "Efficiency: finds where the hours go." },
  { topic: "manual_processes", lever: "efficiency", text: "Which of those run the exact same steps every time but are still done by hand?", why: "Efficiency: repeatable steps are the easiest to automate." },
  { topic: "volume_spikes", lever: "quality", text: "What breaks first when volume spikes?", why: "Quality: shows where the process fails under load." },
  { topic: "tool_stack", lever: "efficiency", text: "What tools are you paying for right now, and which ones does the team actually open every day?", why: "Efficiency: maps the stack, its cost and its real usage." },
  { topic: "tool_overlap", lever: "efficiency", text: "Where are you paying for two tools that do the same job?", why: "Efficiency: overlap is spend you can recover." },
  { topic: "lead_leakage", lever: "effectiveness", text: "Where do leads slip through the cracks between first touch and signed?", why: "Effectiveness: leaks between touch and signature are lost revenue." },
  { topic: "close_rate", lever: "effectiveness", text: "What's your close rate from proposal to signed — and how long does a proposal take to build?", why: "Effectiveness: speed to proposal moves the close rate." },
  { topic: "quality_dips", lever: "quality", text: "Where does quality dip, or a client notice a mistake, when things get busy?", why: "Quality: client-visible mistakes carry the real cost." },
  { topic: "team_resistance", lever: "quality", text: "Who on the team would resist a new system — and what burned them last time?", why: "Quality: past failures predict adoption risk." },
  { topic: "decision_timeline", lever: "decision", text: "Who else weighs in on a decision like this, and what does your timeline look like?", why: "Avoids a surprise veto and tests the urgency." },
  { topic: "one_fix", lever: "outcomes", text: "If we fixed exactly one thing in the next 90 days, what would make this a no-brainer win?", why: "Ends on the outcome they would sign for." },
];
