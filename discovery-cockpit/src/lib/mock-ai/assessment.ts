/**
 * What an ASSESSMENT call adds on top of a discovery call: the processes the client described,
 * the security and governance gaps they admitted to, and the finance figures they stated. These
 * feed the prototype dashboard. Like everything in the engine, only CLIENT sentences count.
 */
import { parseTime } from "./quantities";
import { findMoney } from "./money";
import type { Period } from "./types";

export interface ProcessFact {
  id: string;
  /** Neutral label, e.g. "Monthly client reporting". */
  label: string;
  /** Weekly hours the client attached to it, when they did. */
  hoursPerWeek: number | null;
}

export interface RiskFact {
  id: string;
  label: string;
  severity: "low" | "medium" | "high";
  /** The tool the risk concerns, when the sentence named one. */
  tool: string | null;
}

export interface FinanceFacts {
  revenueMonthly: number | null;
  receivables: number | null;
  payrollMonthly: number | null;
  /** Recurring spend on contractors and other overhead, per month (software is counted separately). */
  overheadMonthly: number | null;
}

export interface AssessmentFacts {
  processes: ProcessFact[];
  risks: RiskFact[];
  finance: FinanceFacts;
  /** Marketing channels the client said they publish on. */
  contentChannels: string[];
  /** Extra weekly admin hours the client quoted for the whole team. */
  adminHoursPerWeek: number | null;
}

const PROCESS_RULES: { id: string; label: string; pattern: RegExp }[] = [
  { id: "lead_intake", label: "Lead intake and first reply", pattern: /\b(website form|inquir(y|ies)|new leads?|first (touch|contact))\b/i },
  { id: "proposals", label: "Proposal building", pattern: /\bproposals?\b/i },
  { id: "onboarding", label: "New-client onboarding", pattern: /\bonboarding\b|\bnew client\b/i },
  { id: "reporting", label: "Monthly client reporting", pattern: /\breports?\b/i },
  { id: "content", label: "Content and marketing", pattern: /\b(linkedin|newsletter|blog|content)\b/i },
  { id: "billing", label: "Invoicing and collections", pattern: /\binvoic(e|es|ing)\b/i },
  { id: "payroll", label: "Payroll and contractor payments", pattern: /\bpayroll\b|\bcontractor invoices\b/i },
  { id: "pipeline_review", label: "Weekly pipeline review", pattern: /\bpipeline review\b/i },
];

const RISK_RULES: { id: string; label: string; severity: RiskFact["severity"]; pattern: RegExp }[] = [
  { id: "shared_logins", label: "Shared logins", severity: "high", pattern: /\b(everyone )?shares? (one|a|the|a single)\b[\w ]{0,25}\b(login|password|account)\b|\bshared (login|password)s?\b/i },
  { id: "former_access", label: "Former staff still have access", severity: "high", pattern: /\b(still has|still have|never (removed|revoked)|nobody removed)\b[^.]{0,60}\b(access|login|account)\b/i },
  { id: "no_mfa", label: "Multi-factor sign-in is off", severity: "high", pattern: /\b(don'?t have|no|not|nobody has|without|never)\b[^.]{0,40}\b(multi-?factor|mfa|2fa|two[- ]factor)\b/i },
  { id: "unapproved_ai", label: "Client data in unapproved AI tools", severity: "high", pattern: /\b(paste[sd]?|put|upload(s|ed)?|feed)\b[^.]{0,50}\b(client|customer)\b[^.]{0,50}\b(chatgpt|claude|gemini|copilot|ai)\b|\b(chatgpt|claude|gemini|copilot)\b[^.]{0,60}\b(client|customer)\b/i },
  { id: "untested_backup", label: "Backups never tested", severity: "medium", pattern: /\bnever (been )?tested\b[^.]{0,30}\b(restore|backup)|\b(restore|backup)s?\b[^.]{0,40}\bnever (been )?tested|\bnever tested a restore\b|\bno backups?\b|\bnot backed up\b/i },
  { id: "personal_devices", label: "Personal devices hold client data", severity: "medium", pattern: /\b(own|personal) (laptops?|computers?|phones?|devices?)\b/i },
  { id: "orphaned_account", label: "A key account sits under someone's personal email", severity: "medium", pattern: /\b(account|subscription|login)\b[^.]{0,30}\bunder (a|an|our|the|someone)?\s*\w*'?s? ?personal email\b|\bpersonal email\b[^.]{0,50}\b(error log|can'?t (see|access|log))/i },
  { id: "spreadsheet_dependency", label: "A critical process lives in one person's spreadsheet", severity: "medium", pattern: /\bonly \w+ knows how\b[^.]{0,40}\b(spreadsheet|sheet)\b/i },
  { id: "unwritten_knowledge", label: "Know-how is not written down", severity: "low", pattern: /\bnothing is written down\b|\blives in (my|someone'?s|our) head\b/i },
];

const CHANNELS: [string, RegExp][] = [
  ["LinkedIn", /\blinkedin\b/i],
  ["Email newsletter", /\bnewsletter\b/i],
  ["Blog", /\bblog\b/i],
  ["Instagram", /\binstagram\b/i],
  ["Facebook", /\bfacebook\b/i],
  ["YouTube", /\byoutube\b/i],
  ["Podcast", /\bpodcast\b/i],
];

const toMonthly = (amount: number, period: Period) => (period === "year" ? Math.round((amount / 12) * 100) / 100 : period === "week" ? Math.round(((amount * 52) / 12) * 100) / 100 : amount);

type FinanceCue = "receivables" | "payroll" | "revenue" | "overhead";
const FINANCE_CUES: { key: FinanceCue; re: RegExp }[] = [
  { key: "receivables", re: /\b(outstanding|receivables?|owed|unpaid|overdue|past due)\b/gi },
  { key: "payroll", re: /\b(payroll|salar(y|ies)|wages)\b/gi },
  { key: "revenue", re: /\b(revenue|sales|turnover)\b/gi },
  { key: "overhead", re: /\b(contractors?|freelancers?|rent|insurance|overhead)\b/gi },
];
const NOT_REVENUE = /\b(on the table|leaving|extra|lost|left)\b/i;

/**
 * Each dollar figure takes the finance word nearest to it, so one sentence can carry several
 * ("Payroll is $20,000 a month and revenue is about $60,000 a month").
 */
function classifyFinance(sentences: string[]): FinanceFacts {
  const out: FinanceFacts = { revenueMonthly: null, receivables: null, payrollMonthly: null, overheadMonthly: null };
  for (const s of sentences) {
    for (const m of findMoney(s)) {
      let best: { key: FinanceCue; dist: number } | null = null;
      for (const cue of FINANCE_CUES) {
        for (const hit of s.matchAll(new RegExp(cue.re.source, cue.re.flags))) {
          const dist = Math.abs((hit.index ?? 0) - m.start);
          if (!best || dist < best.dist) best = { key: cue.key, dist };
        }
      }
      if (!best) continue;
      const monthly = toMonthly(m.amount, m.period === "unspecified" ? "month" : m.period);
      if (best.key === "receivables") out.receivables ??= m.amount;
      else if (best.key === "payroll") out.payrollMonthly ??= monthly;
      else if (best.key === "revenue") {
        if (!NOT_REVENUE.test(s)) out.revenueMonthly ??= monthly;
      } else out.overheadMonthly = (out.overheadMonthly ?? 0) + monthly;
    }
  }
  return out;
}

export function extractAssessment(clientSentences: { text: string; order: number }[], toolNames: string[]): AssessmentFacts {
  const processes = new Map<string, ProcessFact>();
  for (const { text } of clientSentences) {
    const hours = parseTime(text)?.weekly ?? null;
    for (const rule of PROCESS_RULES) {
      if (!rule.pattern.test(text)) continue;
      const existing = processes.get(rule.id);
      if (!existing) processes.set(rule.id, { id: rule.id, label: rule.label, hoursPerWeek: hours });
      else if (hours !== null && (existing.hoursPerWeek ?? 0) < hours) existing.hoursPerWeek = hours;
    }
  }

  const risks = new Map<string, RiskFact>();
  for (const { text } of clientSentences) {
    for (const rule of RISK_RULES) {
      if (risks.has(rule.id) || !rule.pattern.test(text)) continue;
      const tool = toolNames.find((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)) ?? null;
      risks.set(rule.id, { id: rule.id, label: rule.label, severity: rule.severity, tool });
    }
  }

  const all = clientSentences.map((s) => s.text).join(" ");
  const channels = CHANNELS.filter(([, re]) => re.test(all)).map(([name]) => name);

  const adminHours = clientSentences
    .map((s) => (/\badmin\b/i.test(s.text) ? (parseTime(s.text)?.weekly ?? null) : null))
    .find((h): h is number => h !== null) ?? null;

  const sevRank = { high: 3, medium: 2, low: 1 } as const;
  return {
    processes: [...processes.values()],
    risks: [...risks.values()].sort((a, b) => sevRank[b.severity] - sevRank[a.severity]),
    finance: classifyFinance(clientSentences.map((s) => s.text)),
    contentChannels: channels,
    adminHoursPerWeek: adminHours,
  };
}
