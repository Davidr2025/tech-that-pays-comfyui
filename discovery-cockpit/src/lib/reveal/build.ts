import { formatMoney, joinList, pluralize } from "../format";
import type { Analysis } from "../mock-ai/types";
import { computeTotals, revealSchema, type RevealData } from "./schema";

export interface RevealInput {
  consultant: { name: string; businessName: string; tagline: string | null };
  /** Whose look the document wears: the consultant's, or the client's colours. */
  branding: { primaryColor: string; accentColor: string; logoUrl: string | null };
  client: { name: string; companyName: string };
  analysis: Analysis;
  generatedAt: Date;
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const unique = (items: string[]) => [...new Set(items)];

/**
 * Builds the client-safe payload. Each field is assembled explicitly from the analysis —
 * nothing is spread or copied wholesale — and the result must pass the strict allow-list
 * schema or this throws. Private analysis fields (readiness, signals, objections, quotes,
 * severity, next question, reflect-back) have no path into the output.
 */
export function buildRevealData({ consultant, branding, client, analysis, generatedAt }: RevealInput): RevealData {
  const techStack = analysis.tech.map((t) => ({
    tool: t.tool,
    purpose: t.purpose,
    monthlyCost: t.monthlyCost,
    annualCost: t.annualCost,
    note: t.note,
  }));
  const totals = computeTotals(techStack);

  const painPoints = analysis.painPoints.map((p) => ({
    title: p.title,
    detail: p.impact ? `${p.description} Reported impact: ${p.impact}.` : p.description,
  }));

  const currentState = unique(analysis.painPoints.map((p) => p.currentState));
  if (techStack.length) {
    currentState.push(`Work runs across ${pluralize(techStack.length, "tool")}: ${joinList(techStack.map((t) => t.tool))}.`);
  }
  const futureState = unique(analysis.painPoints.map((p) => p.futureState));

  const sentences: string[] = [
    `During our discovery conversation, ${client.name} of ${client.companyName} walked through how work flows through the business today and where it slows down.`,
  ];
  if (painPoints.length) {
    sentences.push(`The main themes were ${joinList(painPoints.map((p) => lowerFirst(p.title)))}.`);
  }
  if (techStack.length) {
    const allCosted = totals.toolsWithCost === totals.toolsTotal;
    const costed = totals.toolsWithCost
      ? ` ${allCosted ? "Their" : `Among the ${pluralize(totals.toolsWithCost, "tool")} with a stated cost, the`} subscriptions total about ${formatMoney(totals.monthly)} per month (${formatMoney(totals.annual)} per year).`
      : "";
    sentences.push(`The business currently uses ${pluralize(techStack.length, "tool")}.${costed}`);
  }
  if (analysis.timeline.deadline) {
    sentences.push(`Your target date is ${analysis.timeline.deadline}.`);
  }
  if (analysis.money.length) {
    sentences.push(
      `You shared ${pluralize(analysis.money.length, "dollar figure")} along the way; each is listed below in context.`,
    );
  }

  return revealSchema.parse({
    version: 1,
    generatedAt: generatedAt.toISOString(),
    header: {
      consultantName: consultant.name,
      businessName: consultant.businessName,
      tagline: consultant.tagline,
      brandColor: branding.primaryColor,
      accentColor: branding.accentColor,
      logoUrl: branding.logoUrl,
      clientName: client.name,
      clientCompany: client.companyName,
    },
    summary: sentences.join(" "),
    timeline: { deadline: analysis.timeline.deadline, window: analysis.timeline.window },
    painPoints,
    currentState,
    futureState,
    moneyMentioned: analysis.money.map((m) => ({ amount: m.amount, period: m.period, context: m.context })),
    techStack,
    totals,
  });
}
