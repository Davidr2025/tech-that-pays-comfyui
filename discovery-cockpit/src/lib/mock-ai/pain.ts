export interface PainCategory {
  id: string;
  /** Matches a client sentence that expresses this kind of problem. */
  pattern: RegExp;
  /** Neutral, client-safe label (never the client's raw words). */
  title: string;
  description: string;
  currentState: string;
  futureState: string;
  /** Hours/days stated against this problem are the size of the time sink. */
  timeSink?: boolean;
  /** A dollar figure stated against this problem is its stated cost. */
  money?: boolean;
  /** Singular noun for a contextual "what is one X worth?" follow-up. */
  dollarize?: string;
}

/** Order here breaks ties between pain points of equal severity and score. */
export const PAIN_CATEGORIES: PainCategory[] = [
  {
    id: "manual_entry",
    pattern:
      /\b(manual(ly)?|copy[ -]?(and|&)?[ -]?paste|re-?enter(ing|ed)?|re-?entry|re-?key(ing|ed)?|retyp(e|ing|ed)|double[- ]entry|typing (it|everything|all)|data entry)\b/i,
    title: "Manual, repetitive data entry",
    description: "Information is captured in more than one place and has to be re-entered by hand.",
    currentState: "Job and customer details are written down in one place and re-typed into another.",
    futureState: "Details are captured once and flow automatically from booking through to invoice.",
    timeSink: true,
  },
  {
    id: "manual_reporting",
    pattern:
      /\breports?\b[^.]{0,60}\b(by hand|manual(ly)?|spreadsheets?|csvs?|wrong|errors?|mistakes?|late|sloppy)\b|\b(by hand|manual(ly)?)\b[^.]{0,60}\breports?\b|\bexports? csvs?\b|\bpastes? (everything|it|them|data|the data)\b/i,
    title: "Manual, time-consuming reporting",
    description: "Reports are assembled by hand from several sources, which takes time and invites mistakes.",
    currentState: "Reports are built by hand each period from several separate exports.",
    futureState: "Reports build themselves from connected data sources and arrive on schedule.",
    timeSink: true,
  },
  {
    id: "outsourcing_cost",
    pattern:
      /(?=.*\b(contractors?|freelancers?|outsourc\w+|upwork|fiverr)\b)(?=.*(\$|\bspend\b|\bpay(ing)?\b|\bcosts?\b))|\bwork a system should be doing\b/i,
    title: "High spend on outsourced overflow work",
    description: "Recurring outside help is covering work that a system could handle.",
    currentState: "Outside contractors absorb overflow work at a recurring monthly cost.",
    futureState: "Routine work is automated, reducing the need for outside overflow help.",
    money: true,
  },
  {
    id: "lead_followup",
    pattern:
      /\b(fall(s|ing)? through the cracks|lose track of|lost leads?|leads? (go|get|are) (cold|lost)|nobody follows? up|no follow[- ]?up|don'?t follow up|missed (calls|leads|estimates|quotes)|lead follow[- ]?up|nobody looks at (them|it)|slow response|we lose people)\b|\blos(e|ing|t)\b[^.]{0,40}\bleads?\b|\bleads?\b[^.]{0,40}\b(die|dies|go cold|slip)\b/i,
    title: "Slow or inconsistent lead follow-up",
    description: "New inquiries are not always answered quickly enough to win them.",
    currentState: "New leads can wait overnight or longer for a reply; follow-up depends on individuals remembering.",
    futureState: "Every new lead gets a reply within minutes and is tracked until it is won or closed.",
    dollarize: "lead",
  },
  {
    id: "slow_sales_cycle",
    pattern:
      /\bproposals?\b[^.]{0,50}\b(takes?|took|days?|weeks?|so long|forever)\b|\bgoes? cold\b|\bweeks on average\b|\bone in (two|three|four|five|six|ten)\b|\bclose rate\b|\bsales cycle\b/i,
    title: "Slow proposals and a long sales cycle",
    description: "Proposals take long to build, which stretches the time to a signed deal.",
    currentState: "Each proposal is assembled by hand from past documents, so prospects wait.",
    futureState: "Proposals are produced quickly from reusable building blocks, shortening the path to signature.",
    money: true,
  },
  {
    id: "tool_overlap",
    pattern:
      /\b(overlap|both places|nobody trusts|paying for two)\b|\b(zaps?|automations?|integrations?) (break|breaks|broke)\b|\b(use|using) (maybe |only |about )?(a (third|quarter|fraction)|half) of it\b/i,
    title: "Overlapping and underused tools",
    description: "Several tools cover the same ground, and some are paid for but barely used.",
    currentState: "Work is tracked in more than one tool, none of them fully trusted, and some automations break.",
    futureState: "A smaller, connected set of tools that the team trusts and actually uses.",
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
    pattern:
      /\b(drown(ing|ed)?|overwhelm(ed|ing)?|stretched (thin|too thin)|swamped|understaffed|can'?t keep up|no time|burn(ing|ed|t)? out|working weekends|nobody else knows|only (she|he) knows|if (she|he)'?s (sick|out|away))\b/i,
    title: "Stretched team and key-person risk",
    description: "Important work depends on a few people who are already at capacity.",
    currentState: "A few people carry critical work with little backup, and some are working extra hours.",
    futureState: "Routine work is automated and documented so no single person is a bottleneck.",
  },
  {
    id: "billing",
    pattern: /\b(chasing (invoices|payments)|late payments?|slow(ly)? (to )?pay|unpaid invoices?|get(ting)? paid|cash flow)\b/i,
    title: "Delays in invoicing and collecting payment",
    description: "Invoices take longer than necessary to send and collect.",
    currentState: "Invoices are prepared after the fact and chased manually.",
    futureState: "Invoices go out as soon as a job closes, with automatic payment reminders.",
    timeSink: true,
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
    timeSink: true,
  },
];

/** Words that raise a pain point's severity when they appear in (or right after) its sentence. */
export const INTENSITY =
  /\b(every (day|week|time)|always|constantly|all the time|nightmare|killing (us|me)|huge|biggest|cost(s|ing)? (me|us)|it cost us|way more|kills? me|embarrass\w*|felt sick|sick to my stomach)\b/i;

/** A consequence the client's own customers can see or feel. */
export const CUSTOMER_VISIBLE =
  /\b(we lose (people|clients?|customers?|leads?|deals?)|lost (a |the )?(clients?|customers?)|(client|customer)s? (spotted|noticed|caught|complain\w*)|spotted it before we did)\b/i;
