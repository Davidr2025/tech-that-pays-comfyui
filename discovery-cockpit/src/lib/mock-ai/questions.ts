export interface BankQuestion {
  topic: string;
  text: string;
  /** Coaching hint shown with the "suggested next question". */
  why: string;
}

/** Default discovery question bank, in natural call order. */
export const QUESTION_BANK: BankQuestion[] = [
  { topic: "overview", text: "Tell me about your business and who you serve.", why: "Opens the call and gets them talking about something easy." },
  { topic: "team", text: "How big is the team, and who does what?", why: "Sizes the operation and shows who touches the problem." },
  { topic: "process", text: "Walk me through how this works today, step by step.", why: "The real process usually differs from the official one." },
  { topic: "pain", text: "What's the biggest frustration with it right now?", why: "Let them name the problem in their own words." },
  { topic: "impact", text: "What does that cost you in time or money?", why: "A pain without a number rarely turns into a purchase." },
  { topic: "tools", text: "What tools and software do you use today, and what does each cost?", why: "Maps the current stack and what it costs to keep." },
  { topic: "tried", text: "What have you already tried to fix this?", why: "Surfaces past failures and objections early." },
  { topic: "goal", text: "If this were solved a year from now, what would that look like?", why: "Gets them to describe the future state themselves." },
  { topic: "urgency", text: "What's driving the timing? Why now?", why: "Urgency separates a project from a someday-idea." },
  { topic: "budget", text: "Is there a budget set aside for solving this?", why: "Better to learn the range now than after a proposal." },
  { topic: "decision", text: "Who else is involved in making this decision?", why: "Avoids a surprise veto after the proposal goes out." },
  { topic: "next", text: "What would a good next step look like for you?", why: "Ends the call with a committed next action." },
];
