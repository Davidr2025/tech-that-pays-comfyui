/**
 * Built-in fictitious discovery call. Every person and company here is invented.
 * Shared by the seed script, the "Load Demo Call" button and the tests, so the three
 * can never drift apart.
 */
import type { SpeakerKind } from "@/lib/mock-ai/types";

export const CEDAR_IDS = {
  consultant: "demo-consultant",
  client: "demo-client",
  session: "demo-session",
} as const;

export const CEDAR_CONSULTANT = {
  name: "Avery Quinn",
  email: "avery@quinn-ops.example",
  businessName: "Quinn Operations Studio",
  tagline: "Practical systems for owner-run service businesses",
  brandColor: "#0f766e",
} as const;

export const CEDAR_CLIENT = {
  name: "Marcus Delgado",
  companyName: "Cedar Ridge Heating & Cooling",
  industry: "Residential HVAC",
} as const;

export const CEDAR_SESSION_TITLE = "Discovery call — Cedar Ridge Heating & Cooling";

export const CEDAR_INTERNAL_NOTES =
  "Marcus responds to numbers, not features. Elena (finance) will want an ROI view. Past field-service app failed on tech adoption — keep the tech-facing flow to two taps.";

const C: SpeakerKind = "CONSULTANT";
const K: SpeakerKind = "CLIENT";

export const CEDAR_SEGMENTS: { speaker: SpeakerKind; text: string }[] = [
  { speaker: C, text: "Thanks for making time, Marcus. Before we get into anything, tell me a bit about Cedar Ridge and who you serve." },
  { speaker: K, text: "Sure. We're a residential heating and cooling company. We install and service furnaces and air conditioners for homeowners. I started the business eleven years ago and we've grown to a team of fourteen people, with eight technicians in the field." },
  { speaker: C, text: "Eleven years is a real run. Walk me through what happens from the moment a customer calls until the job is paid for." },
  { speaker: K, text: "So a call comes in to the office, and Dana, our office manager, writes it on a sticky note or types it into a Google Sheet. Then she texts the closest technician. After the job, the tech takes a photo of the paperwork, and Dana types it all into QuickBooks to invoice. It's a lot of copy and paste, and honestly it's all manual." },
  { speaker: C, text: "How many hours a week does that paperwork loop take?" },
  { speaker: K, text: "Dana spends about 15 hours a week just on re-entering job details and chasing invoices. And she's drowning. We constantly lose track of leads, too. Three or four estimate requests a week fall through the cracks because nobody follows up." },
  { speaker: C, text: "That sounds expensive in more ways than one. What do you think those lost estimates are worth?" },
  { speaker: K, text: "Our average install is around $9,500, so if even one of those four a week closes, we're talking real money. Over a year I'd guess we're leaving at least $120,000 on the table." },
  { speaker: C, text: "Let's talk tools. What software is the team using today, and roughly what does each cost?" },
  { speaker: K, text: "QuickBooks Online is $85 a month. Mailchimp is $45 a month, though nobody has sent a campaign in a year. Dana pays $16 a month for Calendly, and we have Slack for the techs at about $60 a month." },
  { speaker: C, text: "Have you tried to fix any of this before?" },
  { speaker: K, text: "We tried a field service app two years ago. The techs hated it and Dana said it didn't talk to QuickBooks, so we dropped it after about $2,400 in setup fees. I'm a little burned on software projects, to be honest, so I worry the next one ends up the same way." },
  { speaker: C, text: "That's useful context, and a fair concern. If this were working really well a year from now, what would that look like for you?" },
  { speaker: K, text: "Honestly? Calls and leads go into one place, jobs flow to invoices without anyone retyping them, and Dana gets her afternoons back. I'd love a dashboard so I can see revenue per tech without asking three people." },
  { speaker: C, text: "What's driving the timing? Why now?" },
  { speaker: K, text: "Busy season starts in about eight weeks. Last summer we had two weeks where nobody could tell me which jobs were invoiced, and it cost us. I need this fixed before the first heat wave, ideally in the next 60 days." },
  { speaker: C, text: "Is there a budget set aside for solving this, or would we be figuring that out together?" },
  { speaker: K, text: "I've set aside about $15,000 for this year. If the numbers make sense I can go higher, because losing 15 hours a week of Dana's time and those leads costs me way more than that." },
  { speaker: C, text: "That's helpful. Who else would be involved in a decision like this?" },
  { speaker: K, text: "Just me and my wife, Elena. She runs the finance side, so she'll want to see the numbers, but I make the final call." },
  { speaker: C, text: "Anything on the team side? How comfortable are the techs with new tools?" },
  { speaker: K, text: "They're fine with their phones. They just won't do anything that takes more than two taps." },
  { speaker: C, text: "Let me make sure I have this right. Work comes in by phone and lands on sticky notes and a spreadsheet, then Dana re-keys everything into QuickBooks, which eats about fifteen hours a week of her time. Estimate requests slip through because nobody owns the follow-up, you can't easily see revenue by technician, and your busy season is eight weeks away. You have roughly fifteen thousand dollars set aside, Elena will want to see the numbers, and you've been burned once by a tool the techs wouldn't use. Is that a fair picture, and what did I miss?" },
  { speaker: K, text: "That's exactly it. You even caught the part about the techs." },
  { speaker: C, text: "What would a good next step look like for you?" },
  { speaker: K, text: "Sounds good. Send over whatever you think makes sense and we'll take it from there." },
  { speaker: C, text: "I'll put together a short write-up by Thursday, and we'll book a 30-minute walkthrough with you and Elena. Thanks, Marcus." },
  { speaker: K, text: "Perfect. Talk soon." },
];
