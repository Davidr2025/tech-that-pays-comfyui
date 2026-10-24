export interface PainCategory {
  id: string;
  /** Matches a client sentence that expresses this kind of problem. */
  pattern: RegExp;
  /** Neutral, client-safe label (never the client's raw words). */
  title: string;
  description: string;
  currentState: string;
  futureState: string;
}

export const PAIN_CATEGORIES: PainCategory[] = [
  {
    id: "manual_entry",
    pattern:
      /\b(manual(ly)?|copy[ -]?(and|&)?[ -]?paste|re-?enter(ing|ed)?|re-?entry|re-?key(ing|ed)?|retyp(e|ing|ed)|double[- ]entry|typing (it|everything|all)|data entry)\b/i,
    title: "Manual, repetitive data entry",
    description: "Information is captured in more than one place and has to be re-entered by hand.",
    currentState: "Job and customer details are written down in one place and re-typed into another.",
    futureState: "Details are captured once and flow automatically from booking through to invoice.",
  },
  {
    id: "lead_followup",
    pattern:
      /\b(fall(s|ing)? through the cracks|lose track of|lost leads?|leads? (go|get|are) (cold|lost)|nobody follows? up|no follow[- ]?up|don'?t follow up|missed (calls|leads|estimates|quotes))\b|\blos(e|ing|t)\b[^.]{0,40}\bleads?\b/i,
    title: "Inconsistent lead and estimate follow-up",
    description: "New inquiries and estimate requests are not always followed up on in time.",
    currentState: "Follow-up on new inquiries depends on individuals remembering to do it.",
    futureState: "Every new inquiry is logged and followed up automatically until it is won or closed.",
  },
  {
    id: "visibility",
    pattern:
      /\b(can'?t (see|tell|track)|no (way|idea) (to|of|what|how)|nobody (could|can) tell|don'?t know (how|what|which|where)|dashboard|visibility|without asking)\b/i,
    title: "Limited visibility into jobs, invoicing and revenue",
    description: "It takes extra effort to see what is booked, invoiced and earned at any moment.",
    currentState: "Answers about job status and revenue come from asking several people.",
    futureState: "A single dashboard shows job status, invoicing and revenue at a glance.",
  },
  {
    id: "capacity",
    pattern: /\b(drown(ing|ed)?|overwhelm(ed|ing)?|stretched (thin|too thin)|swamped|understaffed|can'?t keep up|no time)\b/i,
    title: "Team capacity is stretched",
    description: "Administrative work is taking time away from higher-value work.",
    currentState: "Office staff are absorbing a growing administrative workload.",
    futureState: "Routine administration is automated so the team can focus on customers.",
  },
  {
    id: "billing",
    pattern: /\b(chasing (invoices|payments)|late payments?|slow(ly)? (to )?pay|unpaid invoices?|get(ting)? paid|cash flow)\b/i,
    title: "Delays in invoicing and collecting payment",
    description: "Invoices take longer than necessary to send and collect.",
    currentState: "Invoices are prepared after the fact and chased manually.",
    futureState: "Invoices go out as soon as a job closes, with automatic payment reminders.",
  },
  {
    id: "disconnected_tools",
    pattern:
      /\b((doesn'?t|didn'?t|don'?t|won'?t) (talk|connect|integrate|sync)|too many (tools|apps|systems)|different (systems|tools|apps)|disconnected|data silos?)\b/i,
    title: "Software that doesn't connect together",
    description: "The tools in use do not share information with one another.",
    currentState: "Several tools are used side by side without sharing data.",
    futureState: "Core tools are connected so information moves between them on its own.",
  },
  {
    id: "delays",
    pattern: /\b(bottleneck|backlog|takes (forever|too long|ages)|waiting (on|for)|slow(s|ed)? (us|things) down|delays?)\b/i,
    title: "Delays that slow work down",
    description: "Work waits on hand-offs and manual steps before it can move forward.",
    currentState: "Hand-offs between people create waiting time.",
    futureState: "Hand-offs are automated so work keeps moving without waiting.",
  },
];

/** Words that raise a pain point's severity when they appear in the same sentence. */
export const INTENSITY = /\b(every (day|week|time)|always|constantly|all the time|nightmare|killing (us|me)|huge|biggest|drown(ing)?|cost(s|ing)? (me|us)|it cost us|way more)\b/i;
