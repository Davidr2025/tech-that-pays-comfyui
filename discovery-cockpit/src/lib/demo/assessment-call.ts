/**
 * Built-in fictitious ASSESSMENT call: the follow-up to the discovery call, same invented agency.
 * One transcript serves all three assessment types (operations, technology, combined); the
 * question banks decide which of its topics count. Everything here is invented.
 */
import type { SpeakerKind } from "../mock-ai/types";

export const DEMO_ASSESSMENT_ID = "demo-assessment";
export const DEMO_ASSESSMENT_TITLE = "Combined assessment — Brightline Marketing";

const C: SpeakerKind = "CONSULTANT";
const K: SpeakerKind = "CLIENT";

export const ASSESSMENT_SEGMENTS: { speaker: SpeakerKind; text: string }[] = [
  { speaker: C, text: "Priya, this is the assessment we scoped. Two parts: how the work actually runs, then the tools and how safely they run. I'll ask a lot of small questions, and I'm recording so I can build you an accurate picture. Okay?" },
  { speaker: K, text: "Sure. Fire away." },
  { speaker: C, text: "Walk me through a typical client engagement, from first contact to final invoice." },
  { speaker: K, text: "A lead fills in the website form and it lands in HubSpot. I look at it when I get to my desk, send a proposal, and if they sign, my account manager sets up the campaigns in Google Ads and Meta and builds a Google Sheet template for their reports. Every month she exports the numbers and writes the commentary, and I approve the report before it goes out. Then Sam, my business partner, sends the invoice from QuickBooks." },
  { speaker: C, text: "Who owns each stage, and what happens when that person is out?" },
  { speaker: K, text: "I own the front end and my account manager owns delivery, and nobody covers for her. When she was sick last month a report went out late. Sam handles invoicing and payroll, but only Sam knows how the payroll spreadsheet works." },
  { speaker: C, text: "How does a new inquiry arrive, and how quickly does it get a reply?" },
  { speaker: K, text: "On a weekday it's usually answered by the next morning, and on weekends not until Monday. We respond inside an hour maybe one time in five. We lose people to faster agencies, no question." },
  { speaker: C, text: "What triggers a follow-up on a proposal, and what happens when nobody follows up?" },
  { speaker: K, text: "Nothing triggers it. I try to remember. About half the proposals I send never get a second email from us, and those mostly go cold. A proposal takes me a full day to put together from old decks." },
  { speaker: C, text: "What happens between a signed deal and the first delivered work?" },
  { speaker: K, text: "Onboarding is a mess. A Zapier flow creates the Asana project, but it breaks about every third client, so my account manager sets it up by hand. That takes her about 6 hours per new client." },
  { speaker: C, text: "Where does delivery work wait on a hand-off or an approval?" },
  { speaker: K, text: "Reports wait for me. I review every one, and they sit in my inbox for two or three days. Content waits for me too." },
  { speaker: C, text: "Let's talk about your own marketing. How does content get planned, written and published?" },
  { speaker: K, text: "We post on LinkedIn twice a week and send a monthly newsletter. I write all of it myself at night. There's no brand voice document, so when my account manager drafts something I rewrite most of it. That's about 5 hours a week on content." },
  { speaker: C, text: "How do invoices get created, sent and chased, and how much is outstanding?" },
  { speaker: K, text: "Sam creates them in QuickBooks on the first of the month and emails them. Chasing happens whenever he remembers. Right now we have about $38,000 outstanding and the slowest invoice is 75 days old." },
  { speaker: C, text: "How are payroll and contractor payments tracked and approved?" },
  { speaker: K, text: "Payroll is about $41,000 a month for the team of nine, and Sam builds it from a spreadsheet. The Upwork contractor invoices separately at roughly $4,000 a month. Our revenue is about $95,000 a month right now." },
  { speaker: C, text: "Which steps run the same way every time yet are still done by hand?" },
  { speaker: K, text: "Monthly reports, onboarding, invoices, and the weekly pipeline review, which is me reading HubSpot out loud for forty minutes. Across the team it's about 25 hours a week of admin that isn't billable." },
  { speaker: C, text: "What breaks first when you take on another large client?" },
  { speaker: K, text: "Reporting, and me. We landed the dental group and within a month my account manager was working weekends." },
  { speaker: C, text: "Which numbers do you look at weekly, and how long does it take to get them?" },
  { speaker: K, text: "Leads, pipeline, ad spend and invoices outstanding. Getting them takes Sam half a day because they live in four places." },
  { speaker: C, text: "Where is the know-how written down, and how do you keep track of what you've promised clients?" },
  { speaker: K, text: "Nothing is written down. It lives in my head and my account manager's. Three months ago we promised a client a monthly call and forgot it for two months." },
  { speaker: C, text: "Now the tools. List every tool you pay for, and what each one costs." },
  { speaker: K, text: "HubSpot Marketing Hub is $800 a month. Asana is $120 a month. Zapier is $99 a month. Calendly is $20 a month. Google Workspace is about $135 a month. QuickBooks Online is $85 a month. Mailchimp is $45 a month, and honestly nobody uses it anymore." },
  { speaker: C, text: "Which tools does the team open every day, and where are two doing the same job?" },
  { speaker: K, text: "HubSpot, Asana and Google Workspace. HubSpot and Mailchimp both send email, and HubSpot and Asana both track tasks, and nobody trusts either one." },
  { speaker: C, text: "Which tools are connected to each other, and which connections have broken?" },
  { speaker: K, text: "Zapier connects the website form to HubSpot and HubSpot to Asana. Half our zaps break every few months, and the Zapier account is under a freelancer's personal email, so I can't even see the error log." },
  { speaker: C, text: "Where does client data live, and which copy do you trust?" },
  { speaker: K, text: "HubSpot has the leads, QuickBooks has billing, and client reports live in a Google Sheet. I trust none of them fully. If a client asks for a number, Sam pulls it from three places, which takes half a day." },
  { speaker: C, text: "Who has admin access to what, and what happens to access when someone leaves?" },
  { speaker: K, text: "Three people are admins in HubSpot. When our last freelancer left nobody removed her, and she still has access to Asana. I only just realized that." },
  { speaker: C, text: "How are logins and passwords shared and stored?" },
  { speaker: K, text: "Everyone shares one HubSpot login that's written in a shared doc, and the ad accounts use one shared login too." },
  { speaker: C, text: "Is multi-factor sign-in turned on for email and the main tools?" },
  { speaker: K, text: "We don't have multi-factor turned on except for my own Google account. Nobody else has it." },
  { speaker: C, text: "Which AI tools does the team use, and with what data?" },
  { speaker: K, text: "Two people paste client reports into ChatGPT on their personal accounts to write the commentary. I know I should have a policy." },
  { speaker: C, text: "How is business data backed up, and when did you last test a restore?" },
  { speaker: K, text: "Google Drive is the backup, and we have never tested a restore." },
  { speaker: C, text: "Which devices touch client data, and who fixes things when a tool breaks?" },
  { speaker: K, text: "Everyone's own laptops and phones, and two contractors use their own computers. When something breaks, whoever notices fixes it, usually my account manager on a weekend." },
  { speaker: C, text: "What technology project has failed before, and why?" },
  { speaker: K, text: "That Zapier onboarding build. It broke during a launch and cost us a week." },
  { speaker: C, text: "If the stack worked perfectly, what would change on Monday morning?" },
  { speaker: K, text: "Reports would already be there, new leads would already have an answer, and I'd stop reading HubSpot out loud. I'd get my evenings back. If you can show me the first version before it touches a live client account, I'm in." },
  { speaker: C, text: "I'll build a prototype from everything you've told me, so you can see it before you decide anything. Fair?" },
  { speaker: K, text: "Fair. Send it over." },
];
