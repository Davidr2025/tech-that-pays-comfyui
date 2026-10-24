/**
 * The mock prototype generator: turns what an assessment call revealed into the four modules.
 *
 * Deterministic and template-driven (no randomness, no network). Every label, tool name and
 * suggested action is derived from THIS client's analysis (their pains, tools, risks, figures and
 * channels). Anything invented to fill a row is flagged `example: true` (or finance
 * `source: "example"`) and the page says so. Output is validated against the strict schemas.
 */
import type { Analysis } from "../mock-ai/types";
import { MODULE_SCHEMAS, MODULE_TITLES, type ModuleType } from "./schema";

export interface PrototypeInput {
  analysis: Analysis;
  company: string;
  industry: string | null;
}

export interface GeneratedModule {
  moduleType: ModuleType;
  title: string;
  order: number;
  data: unknown;
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const ceilTo = (n: number, step: number) => Math.max(step, Math.ceil(n / step) * step);

// ---------- Client Nurture ----------

function nurture({ analysis, company }: PrototypeInput) {
  const crm = analysis.tech.find((t) => /crm/i.test(t.purpose))?.tool ?? null;
  const lead = analysis.painPoints.find((p) => p.id === "lead_followup");
  const sales = analysis.painPoints.find((p) => p.id === "slow_sales_cycle");
  const where = crm ?? "your inbox";

  const contacts = [
    {
      id: "n1",
      label: "New website inquiry",
      stage: "Awaiting first reply",
      temperature: "hot" as const,
      daysSinceContact: 1,
      nextAction: `Reply today from ${where} and offer a short call.${lead ? ` You told us leads go cold when replies are slow${lead.impact ? ` (${lead.impact})` : ""}.` : ""}`,
    },
    {
      id: "n2",
      label: "Proposal sent, no reply yet",
      stage: "Proposal sent",
      temperature: "warm" as const,
      daysSinceContact: 9,
      nextAction: `Send a two-line check-in and offer a 15-minute walkthrough.${sales ? " Proposals take a while to build, so keep this one short and reuse the same building blocks." : ""}`,
    },
    {
      id: "n3",
      label: "Past client, review due",
      stage: "Past client",
      temperature: "cold" as const,
      daysSinceContact: 47,
      nextAction: `Offer a short results review. It is the cheapest route to repeat work for ${company}.`,
    },
    {
      id: "n4",
      label: "Referral from a current client",
      stage: "Introduced",
      temperature: "hot" as const,
      daysSinceContact: 2,
      nextAction: "Thank the referrer and book an intro this week.",
    },
    {
      id: "n5",
      label: "Expansion at a current client",
      stage: "Discussing scope",
      temperature: "warm" as const,
      daysSinceContact: 14,
      nextAction: "Draft a one-page plan for the extra scope and send it ahead of the next call.",
    },
  ];

  const basis = [
    lead ? `From the call: ${lower(lead.title)}.` : "No lead follow-up problem came up on the call, so rows follow a standard pipeline.",
    crm ? `Your CRM is ${crm}; actions point there.` : "No CRM was named on the call.",
    "Rows marked Example are illustrative, not your real contacts.",
  ];
  return {
    summary: `One list of who needs a reply, ranked by urgency${crm ? `, fed from ${crm}` : ""}. Each row carries the next action so nobody has to remember.`,
    basis,
    contacts: contacts.map((c) => ({ ...c, example: true as const })),
  };
}

// ---------- Content Studio ----------

const DRAFTS: Record<string, { topic: string; body: string }> = {
  manual_reporting: {
    topic: "Why client reports take days (and don't have to)",
    body: "Most client reports start the same way: a handful of exports, a spreadsheet and an evening of copy and paste. It works until volume grows. A connected setup pulls the numbers together on a schedule, so your team spends its time on what the numbers mean. If your reports still start with an export, it may be worth a look.",
  },
  manual_entry: {
    topic: "The cost of typing the same thing twice",
    body: "When the same details are entered in two places, one of them is usually wrong. Capture information once, near where it happens, and let it flow to the rest. It is a small change with a surprisingly large effect on a team's week.",
  },
  lead_followup: {
    topic: "Every inquiry gets an answer today",
    body: "A new inquiry is at its warmest in the first hour. Most teams reply when someone gets to it. A simple rule, every inquiry gets an answer today, changes who wins the work. How quickly does your team reply?",
  },
  slow_sales_cycle: {
    topic: "Proposals should be assembly, not authoring",
    body: "Prospects go cold while a proposal is being written. The fix is rarely working faster; it is starting from the right building blocks. Keep one library of pricing, case studies and terms, and a proposal becomes assembly.",
  },
  outsourcing_cost: {
    topic: "When outside help becomes the plan",
    body: "Outside help is useful for peaks. When it becomes the plan for routine work, it is worth asking which of those tasks a system could do instead.",
  },
  tool_overlap: {
    topic: "More tools rarely means more done",
    body: "Once a year, list every subscription, who actually uses it, and what it replaced. The overlap shows up fast, and so does the saving.",
  },
  capacity: {
    topic: "One person's day off shouldn't stop delivery",
    body: "If one person's absence would delay a client deliverable, that process has a single point of failure. Writing the steps down is the first fix, and often the cheapest.",
  },
  visibility: {
    topic: "Five numbers worth seeing every Monday",
    body: "You don't need a hundred charts. Pick the five numbers that decide your week and put them in one place that updates itself.",
  },
  billing: {
    topic: "Send the invoice the day the work finishes",
    body: "Cash flow often improves more from invoicing promptly and reminding politely than from any pricing change.",
  },
  disconnected_tools: {
    topic: "Connected tools beat clever tools",
    body: "The best stack is the one where information moves on its own. Before adding a tool, ask what it will connect to.",
  },
  delays: {
    topic: "Where work waits",
    body: "Most delay hides in hand-offs, not in the work itself. Map where things wait for approval and you will find your quickest win.",
  },
};
/** Pain points that describe the client's internal economics, not a topic for their audience. */
const INTERNAL_ONLY = new Set(["outsourcing_cost"]);
const GENERIC_DRAFT = { topic: "What we learned this quarter", body: "A short note on one thing we changed this quarter and what it did for our clients." };

function content({ analysis, company, industry }: PrototypeInput) {
  const discussed = analysis.assessment.contentChannels;
  const channels = discussed.length ? discussed : ["LinkedIn"];
  // Draft topics come from the problems the client described, except ones that are about their own
  // internal costs: those are not things to publish to an audience.
  const sources = analysis.painPoints.filter((p) => !INTERNAL_ONLY.has(p.id)).slice(0, 3).map((p) => DRAFTS[p.id] ?? GENERIC_DRAFT);
  const picked = sources.length ? sources : [GENERIC_DRAFT];
  const drafts = picked.map((d, i) => ({
    id: `d${i + 1}`,
    channel: channels[i % channels.length]!,
    topic: d.topic,
    body: `${d.body}\n\n— The ${company} team`,
    example: true as const,
  }));
  return {
    summary: `Starting-point drafts for ${channels.join(" and ")}, built from the problems you described. Your own audience's questions will sharpen them. Nothing is published until you approve it.`,
    channels,
    voice: `A plain, practical starting voice${industry ? ` for ${industry.toLowerCase()}` : ""}. Replace it with a few of ${company}'s own posts and the drafts will follow how you actually write.${discussed.length ? "" : " No channels came up on the call, so LinkedIn is used as an example."}`,
    drafts,
  };
}

// ---------- Financial Pulse ----------

function finance({ analysis }: PrototypeInput) {
  const f = analysis.assessment.finance;
  const toolMonthly = analysis.tech.reduce((sum, t) => sum + (t.monthlyCost ?? 0), 0);
  const overheadActual = toolMonthly + (f.overheadMonthly ?? 0);

  const revenue = f.revenueMonthly ?? 80_000;
  const lines = [
    { key: "revenue" as const, label: "Revenue", actual: revenue, budget: ceilTo(revenue * 1.05, 1000), source: f.revenueMonthly !== null ? ("stated" as const) : ("example" as const) },
    { key: "receivables" as const, label: "Receivables outstanding", actual: f.receivables ?? Math.round(revenue * 0.3), budget: ceilTo(revenue * 0.25, 1000), source: f.receivables !== null ? ("stated" as const) : ("example" as const) },
    { key: "payroll" as const, label: "Payroll", actual: f.payrollMonthly ?? Math.round(revenue * 0.45), budget: ceilTo((f.payrollMonthly ?? revenue * 0.45) * 1.03, 500), source: f.payrollMonthly !== null ? ("stated" as const) : ("example" as const) },
    { key: "overhead" as const, label: "Overhead (software and contractors)", actual: overheadActual > 0 ? overheadActual : Math.round(revenue * 0.06), budget: ceilTo((overheadActual > 0 ? overheadActual : revenue * 0.06) * 1.1, 500), source: overheadActual > 0 ? ("stated" as const) : ("example" as const) },
  ];
  return {
    period: "Current month",
    // Where the actuals came from is worked out at render time (financeProvenance): it changes when figures are entered.
    summary: "What comes in, what is owed to you, and what goes out, on one screen.",
    note: "Budgets are placeholders until you set your own. For receivables the budget is a target ceiling, not something you agreed.",
    lines,
  };
}

// ---------- Security & Governance ----------

const ALERTS: Record<string, { title: string; detail: string }> = {
  shared_logins: { title: "Shared login used from 3 locations", detail: "A login shared by several people was used from three places within 24 hours." },
  former_access: { title: "Former contractor still has access", detail: "An account belonging to someone who has left is still active." },
  no_mfa: { title: "Sign-in without multi-factor", detail: "A sign-in to a main tool did not use a second factor." },
  unapproved_ai: { title: "Client data sent to an unapproved AI tool", detail: "Text that looks like a client report was submitted to a consumer AI service from a personal account." },
  untested_backup: { title: "No restore test on record", detail: "Backups exist, but nobody has proved a restore works." },
  personal_devices: { title: "Client files on an unmanaged device", detail: "Client documents synced to a personal device that the business does not manage." },
  orphaned_account: { title: "Account owned by a personal email", detail: "A business tool is registered to someone's personal email, so nobody else can see its errors or recover it." },
  spreadsheet_dependency: { title: "Critical spreadsheet has one editor", detail: "A process the business depends on lives in a single person's spreadsheet." },
  unwritten_knowledge: { title: "Process not documented", detail: "A repeated process exists only in people's heads." },
};
const FALLBACK_ALERTS = [
  { severity: "medium" as const, title: "New device signed in", detail: "A sign-in came from a device not seen before." },
  { severity: "low" as const, title: "Large export of contacts", detail: "A user exported a large contact list." },
  { severity: "low" as const, title: "File shared outside the workspace", detail: "A client document was shared with an external address." },
];
const AGE_MINUTES = [4, 19, 47, 95, 180, 340, 720];

function security({ analysis }: PrototypeInput) {
  const rows = analysis.assessment.risks
    .filter((r) => ALERTS[r.id])
    .map((r) => ({ severity: r.severity, tool: r.tool, ...ALERTS[r.id]! }));
  const zapier = analysis.tech.find((t) => t.tool === "Zapier");
  if (zapier && analysis.painPoints.some((p) => p.id === "tool_overlap")) {
    rows.push({ severity: "medium", tool: zapier.tool, title: "Zapier automations failing", detail: "Several automations failed this week and nobody was notified." });
  }
  for (const f of FALLBACK_ALERTS) if (rows.length < 3) rows.push({ ...f, tool: null });
  const sevRank = { high: 3, medium: 2, low: 1 } as const;
  const feed = rows
    .sort((a, b) => sevRank[b.severity] - sevRank[a.severity])
    .slice(0, 7)
    .map((r, i) => ({
      id: `s${i + 1}`,
      severity: r.severity,
      title: r.tool ? `${r.title} (${r.tool})` : r.title,
      detail: r.detail,
      minutesAgo: AGE_MINUTES[i]!,
      tool: r.tool,
      example: true as const,
    }));
  const found = analysis.assessment.risks.length;
  return {
    summary: `A running feed instead of a month-end report. ${found} ${found === 1 ? "gap" : "gaps"} you described on the call ${found === 1 ? "is" : "are"} shown as the alerts you would see.`,
    feed,
  };
}

const BUILDERS: Record<ModuleType, (input: PrototypeInput) => unknown> = { nurture, content, finance, security };
const ORDER: ModuleType[] = ["nurture", "content", "finance", "security"];

export function generatePrototype(input: PrototypeInput): GeneratedModule[] {
  return ORDER.map((moduleType, order) => ({
    moduleType,
    title: MODULE_TITLES[moduleType],
    order,
    data: MODULE_SCHEMAS[moduleType].parse(BUILDERS[moduleType](input)),
  }));
}
