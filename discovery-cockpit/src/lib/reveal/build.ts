import { formatMoney, joinList, pluralize } from "../format";
import type { Analysis } from "../mock-ai/types";
import type { SessionType } from "../session-types";
import { embeddableBooking } from "./booking";
import { computeTimeEstimate, RECOVERY_RATE, statedCostsFrom, timeSinksFrom, WEEKS_PER_YEAR } from "./roi";
import { computeTotals, revealSchema, type RevealData } from "./schema";

export interface RevealInput {
  consultant: { name: string; businessName: string; tagline: string | null };
  /** Whose look the document wears: the consultant's, or the client's colours. */
  branding: { primaryColor: string; accentColor: string; logoUrl: string | null };
  client: { name: string; companyName: string };
  analysis: Analysis;
  generatedAt: Date;
  kind?: SessionType;
  /** The consultant's assumption for what an hour of the client's time is worth (whole dollars). */
  hourlyValue?: number | null;
  /** Where the client can book a follow-up: the client's own link, else the consultant's default. */
  bookingUrl?: string | null;
  /** The consultant has opted in to showing an embeddable booking page inside the review. */
  embedBooking?: boolean;
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const unique = (items: string[]) => [...new Set(items)];

/**
 * Builds the client-safe payload. Each field is assembled explicitly from the analysis —
 * nothing is spread or copied wholesale — and the result must pass the strict allow-list
 * schema or this throws. Private analysis fields (readiness, signals, objections, quotes,
 * severity, next question, reflect-back) have no path into the output.
 */
/** Plain next steps drawn only from what the client said. Never exceeds the schema's limit of six. */
function buildNextSteps(analysis: Analysis, consultantName: string): string[] {
  const steps = ["Read through this summary and tell us anything we missed or got wrong."];
  const top = analysis.painPoints[0];
  if (top) steps.push(`Choose the first problem to fix. The conversation points to ${lowerFirst(top.title)}.`);
  if (analysis.painPoints.some((p) => p.id === "tool_overlap")) {
    steps.push("Review which of your tools are doing overlapping work before adding anything new.");
  }
  if (analysis.timeline.deadline) steps.push(`Work back from your ${analysis.timeline.deadline} date to set when the work should start.`);
  steps.push(`Book a follow-up call with ${consultantName} to walk through a proposed plan.`);
  return steps;
}

export function buildRevealData({ consultant, branding, client, analysis, generatedAt, kind = "DISCOVERY", hourlyValue = null, bookingUrl = null, embedBooking = false }: RevealInput): RevealData {
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
    `During our ${kind === "DISCOVERY" ? "discovery conversation" : "assessment"}, ${client.name} of ${client.companyName} walked through how work flows through the business today and where it slows down.`,
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

  const time = computeTimeEstimate(timeSinksFrom(analysis), hourlyValue);
  const statedCosts = statedCostsFrom(analysis);
  const assumptions = [
    ...(time
      ? [
          "Hours use the low end of any range you gave, and each statement is counted once.",
          `Hours per year assume ${WEEKS_PER_YEAR} working weeks.`,
          `“Could be recovered” assumes automation returns about ${Math.round(RECOVERY_RATE * 100)}% of that time. It is a planning figure, not a promise.`,
          hourlyValue !== null
            ? `Dollar value uses ${formatMoney(hourlyValue)} per hour. That is an assumption, not a figure you stated.`
            : "No hourly value was set, so time is not converted to dollars.",
        ]
      : []),
    ...(statedCosts.length > 1 ? ["Stated costs are shown separately and not added together, because they may overlap."] : []),
  ];

  return revealSchema.parse({
    version: 1,
    kind,
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
    roi: time || statedCosts.length ? { time, statedCosts, assumptions } : null,
    nextSteps: buildNextSteps(analysis, consultant.name),
    booking: bookingUrl ? { url: bookingUrl, label: `Book a call with ${consultant.name}`, embed: embedBooking && embeddableBooking(bookingUrl) } : null,
  });
}
