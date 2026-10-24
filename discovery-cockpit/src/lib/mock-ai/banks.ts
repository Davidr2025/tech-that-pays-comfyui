import type { SessionType } from "../session-types";
import { QUESTION_BANK, type BankQuestion } from "./questions";

const q = (topic: string, lever: BankQuestion["lever"], text: string, why: string): BankQuestion => ({ topic, lever, text, why });

/**
 * Operational assessment: how the work actually runs, process by process. Topics are prefixed
 * `ops_` so they never collide with the discovery or technology banks (a combined session
 * uses both, and a session's topics must be unique).
 */
export const OPERATIONS_BANK: BankQuestion[] = [
  q("ops_flow", "context", "Walk me through a typical client engagement, from first contact to final invoice.", "Maps the whole flow before diving into any one step."),
  q("ops_owners", "quality", "Who owns each stage, and what happens when that person is out?", "Quality: single points of failure show up here."),
  q("ops_intake", "effectiveness", "How does a new inquiry arrive, who sees it first, and how quickly does it get a reply?", "Effectiveness: response time decides who wins the lead."),
  q("ops_followup", "effectiveness", "What triggers a follow-up on a lead or a proposal, and what happens when nobody follows up?", "Effectiveness: unowned follow-up is silent revenue loss."),
  q("ops_proposals", "effectiveness", "Walk me through how a proposal gets built and how long it takes.", "Effectiveness: slow proposals stretch the sales cycle."),
  q("ops_onboarding", "quality", "What happens between a signed deal and the first delivered work?", "Quality: the first weeks set the client's impression."),
  q("ops_handoffs", "efficiency", "Where does delivery work wait on a hand-off or an approval?", "Efficiency: waiting time is the cheapest time to recover."),
  q("ops_reporting", "efficiency", "How are client reports and status updates produced, and by whom?", "Efficiency: recurring reports are prime automation targets."),
  q("ops_content", "effectiveness", "How does marketing content get planned, written, approved and published?", "Effectiveness: consistent content feeds the pipeline."),
  q("ops_billing", "efficiency", "How do invoices get created, sent and chased?", "Efficiency: billing admin compounds every month."),
  q("ops_receivables", "effectiveness", "How much is outstanding right now, and how long does the slowest invoice take to be paid?", "Effectiveness: late payment is a cash-flow cost."),
  q("ops_payroll", "efficiency", "How are time, payroll and contractor payments tracked and approved?", "Efficiency: payroll prep is repeatable and error-prone."),
  q("ops_repeatable", "efficiency", "Which steps run the same way every time yet are still done by hand?", "Efficiency: same steps every time means automatable."),
  q("ops_errors", "quality", "When did something last go wrong in a way the client noticed, and why?", "Quality: client-visible mistakes carry the real cost."),
  q("ops_capacity", "quality", "What breaks first when you take on another large client?", "Quality: shows where the process fails under load."),
  q("ops_metrics", "effectiveness", "Which numbers do you look at weekly, and how long does it take to get them?", "Effectiveness: slow numbers mean slow decisions."),
  q("ops_knowledge", "quality", "Where is the know-how written down, and what lives only in someone's head?", "Quality: undocumented know-how is key-person risk."),
  q("ops_promises", "quality", "How do you keep track of what you have promised each client?", "Quality: dropped promises are the commonest complaint."),
  q("ops_adminhours", "efficiency", "Roughly how many hours a week go to admin that is not billable?", "Efficiency: puts a number on the opportunity."),
  q("ops_priority", "outcomes", "If one process were fixed in the next 90 days, which would pay back fastest?", "Ends on the outcome they would sign for."),
];

/** Technology assessment: the stack, what it costs, how it connects, and how safely it runs. */
export const TECHNOLOGY_BANK: BankQuestion[] = [
  q("tech_inventory", "efficiency", "List every tool the team pays for, and what each one costs.", "Efficiency: you cannot trim a stack you have not listed."),
  q("tech_usage", "efficiency", "Which tools does the team open every day, and which are barely used?", "Efficiency: unused seats are recoverable spend."),
  q("tech_duplicates", "efficiency", "Where are two tools doing the same job?", "Efficiency: overlap is the easiest saving."),
  q("tech_source", "quality", "Where does client and lead data live, and which copy is the one you trust?", "Quality: no single source of truth means conflicting answers."),
  q("tech_integrations", "efficiency", "Which tools are connected to each other, and which connections have broken?", "Efficiency: broken connections mean manual re-entry."),
  q("tech_automation", "efficiency", "What runs automatically today, and who maintains it?", "Efficiency: unmaintained automation fails quietly."),
  q("tech_spreadsheets", "quality", "Which spreadsheets does the business depend on?", "Quality: critical spreadsheets are fragile systems."),
  q("tech_numbers", "effectiveness", "If a client asked for a number today, where would you pull it from?", "Effectiveness: shows how quickly the stack answers questions."),
  q("tech_ai", "governance", "Which AI tools does the team use, and with what data?", "Governance: unapproved AI use can leak client data."),
  q("tech_access", "governance", "Who has admin access to what, and what happens to access when someone leaves?", "Governance: lingering access is a common gap."),
  q("tech_passwords", "governance", "How are logins and passwords shared and stored?", "Governance: shared logins hide who did what."),
  q("tech_mfa", "governance", "Is multi-factor sign-in turned on for email and the main tools?", "Governance: the cheapest protection against account takeover."),
  q("tech_backup", "governance", "How is business data backed up, and when did you last test a restore?", "Governance: an untested backup is a hope, not a plan."),
  q("tech_devices", "governance", "Which devices and personal accounts touch client data?", "Governance: personal devices widen the surface."),
  q("tech_vendors", "governance", "Which vendors hold client data, and what do the contracts say about it?", "Governance: you are accountable for vendors' handling."),
  q("tech_support", "quality", "Who fixes things when a tool breaks?", "Quality: an unowned stack stays broken."),
  q("tech_pastfail", "quality", "What technology project has failed before, and why?", "Quality: past failures predict adoption risk."),
  q("tech_spend", "efficiency", "What do you spend on technology in a year, and who approves a new tool?", "Efficiency: uncontrolled adding is how overlap starts."),
  q("tech_datapath", "effectiveness", "How does data get from ads, CRM and billing into one view?", "Effectiveness: joined-up data drives reporting."),
  q("tech_wish", "outcomes", "If the stack worked perfectly, what would change on Monday morning?", "Ends on the outcome they would sign for."),
];

/** The question bank a session of this type starts with. A combined assessment asks both. */
export function bankFor(type: SessionType): BankQuestion[] {
  switch (type) {
    case "DISCOVERY":
      return QUESTION_BANK;
    case "OPERATIONAL_ASSESSMENT":
      return OPERATIONS_BANK;
    case "TECHNOLOGY_ASSESSMENT":
      return TECHNOLOGY_BANK;
    case "COMBINED_ASSESSMENT":
      return [...OPERATIONS_BANK, ...TECHNOLOGY_BANK];
  }
}

export const ALL_BANKS: BankQuestion[] = [...QUESTION_BANK, ...OPERATIONS_BANK, ...TECHNOLOGY_BANK];
