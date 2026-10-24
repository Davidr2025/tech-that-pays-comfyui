/**
 * Built-in fictitious discovery call (the "Demo Seed Pack"): a 9-person boutique marketing
 * agency. Every person and company here is invented. Shared by the seed script, the
 * "Load Demo Call" button and the tests, so the three can never drift apart.
 *
 * Dollar figures are written with `$` signs because the mock engine's money regex reads
 * digits; a real speech-to-text feed would need a number-word normaliser.
 */
import type { SpeakerKind } from "../mock-ai/types";

export const DEMO_IDS = {
  consultant: "demo-consultant",
  client: "demo-client",
  session: "demo-session",
} as const;

export const DEMO_CONSULTANT = {
  name: "Avery Quinn",
  email: "avery@quinn-ops.example",
  businessName: "Quinn Operations Studio",
  tagline: "Practical systems for owner-run service businesses",
  primaryColor: "#0f766e",
  accentColor: "#d97706",
  calendarLink: "https://calendar.example/avery-quinn/30min",
} as const;

export const DEMO_CLIENT = {
  name: "Priya Nair",
  companyName: "Brightline Marketing",
  industry: "Marketing agency",
  websiteUrl: "https://brightline.example/",
  /** The consultant's assumption, shown to the client labelled as one. */
  hourlyValue: 60,
} as const;

export const DEMO_SESSION_TITLE = "Discovery call — Brightline Marketing";

export const DEMO_INTERNAL_NOTES =
  "Priya is the sole decision-maker and has a hard mid-November deadline. Trust is the risk: a Zapier build broke during a client launch two years ago. Show exactly what any automation does before it touches a live client account (validate, reframe, redirect). Put a dollar value on a recovered lead for the reveal.";

const C: SpeakerKind = "CONSULTANT";
const K: SpeakerKind = "CLIENT";

export const DEMO_SEGMENTS: { speaker: SpeakerKind; text: string }[] = [
  { speaker: C, text: "Priya, thanks for jumping on. Quick framing: this is forty-five minutes, all about how Brightline runs today — where the hours go, what's manual, what the tools cost. I'm not pitching; at the end I'll tell you straight whether an assessment makes sense. Recording so I can build you an accurate picture — okay?" },
  { speaker: K, text: "Yes, totally fine. Honestly I'm drowning a little. We just signed our biggest retainer ever — a regional dental group with twelve locations — and they expect the kind of reporting our enterprise clients get. Right now my account manager spends basically two full days a week building those reports by hand." },
  { speaker: C, text: "Two days a week on reporting. Walk me through what that actually looks like — where does the data come from?" },
  { speaker: K, text: "Everywhere. Google Ads, Meta, the client's booking system, our CRM. She exports CSVs, pastes everything into a Google Sheet template, screenshots the charts, then writes the commentary in a doc. It's easily ten to twelve hours a week, and if she's sick, nobody else knows the process. Last month a report went out with the wrong month's numbers and the client spotted it before we did. That was embarrassing." },
  { speaker: C, text: "Painful. What else eats hours like that — the repeatable stuff that's still done by hand?" },
  { speaker: K, text: "Lead follow-up, for sure. Inquiries come in through the website form into HubSpot, but nobody looks at them until the next morning — sometimes longer on weekends. We lose people. I'd estimate three to four good leads a month die just from slow response. And proposals: a proper proposal takes me a full day because I'm digging through old decks for pricing and case studies." },
  { speaker: C, text: "Let's talk money for a second. What are you paying for the tool stack right now?" },
  { speaker: K, text: "HubSpot is the big one — about $800 a month for the Marketing Hub, and honestly we use maybe a third of it. Then Asana at around $120 a month, Zapier at $99 a month — though half our zaps break every few months and nobody fixes them. Calendly is $20 a month. Google Workspace for the team is about $135 a month. And we pay a contractor on Upwork roughly $4,000 a month to help with the reporting overflow." },
  { speaker: C, text: "So about twelve hundred a month on software, plus four thousand on reporting help. Where do you think you're paying for overlap?" },
  { speaker: K, text: "HubSpot and Asana, definitely — tasks live in both places and nobody trusts either one. And honestly the Upwork spend is what kills me. $4,000 a month, $48,000 a year, on work a system should be doing. I did the math last week and felt sick." },
  { speaker: C, text: "What's your close rate look like, proposal to signed?" },
  { speaker: K, text: "Maybe one in four. And it takes three weeks on average from first call to signed proposal, because the proposal itself takes so long. Meanwhile the prospect goes cold. If I could turn a proposal around in two days, I think we'd close one in three, easy. That's probably an extra $150,000 a year in revenue we're leaving on the table." },
  { speaker: C, text: "How big is that dental retainer relative to the business?" },
  { speaker: K, text: "About thirty percent of our revenue now. Twelve locations, and if the reporting lands well they've hinted at rolling us out to their sister company — another eight locations. The first report is basically our audition. If it's late or sloppy we don't just lose a report, we lose the expansion. My account manager is working weekends to keep up and she's told me she's burning out. That's not sustainable." },
  { speaker: C, text: "Who else would weigh in on a decision to do an assessment, and what does your timeline look like?" },
  { speaker: K, text: "It's just me, honestly. My business partner handles finance but he trusts my call on operations. Timeline-wise, the dental group wants their first proper report by mid-November, so I'd want to move in the next two to three weeks if we do this. I don't have time for a six-month project." },
  { speaker: C, text: "Last one: you've tried automation before?" },
  { speaker: K, text: "We did, two years ago. Hired a freelancer to automate our client onboarding in Zapier and it broke during a launch. Took us a week to untangle. So I'm cautious — I need to see exactly what it does before anything touches a live client account. But if you can show me reporting that builds itself and leads answered in minutes, I'd sign up tomorrow. How fast could we start?" },
  { speaker: C, text: "I can get you a proposal by Tuesday with a fixed-scope assessment: we map your five biggest time sinks, the tool overlap, and the quick wins — then you decide. Fair?" },
  { speaker: K, text: "Fair. Send it over." },
];
