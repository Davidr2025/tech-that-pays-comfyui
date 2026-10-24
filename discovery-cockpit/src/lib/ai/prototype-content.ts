/**
 * Lets a model write the EXAMPLE content of three prototype modules (Client Nurture, Content Studio, Security &
 * Governance). It never writes ids, flags, statuses or dates: the app sets `example: true` on every row, a
 * `pending` status on every draft and the feed's ages. Financial Pulse always comes from the rule-based builder,
 * because its actuals must be either something the client said or clearly labelled example figures.
 */
import { MODULE_SCHEMAS, MODULE_TITLES } from "../prototype/schema";
import type { GeneratedModule, PrototypeInput } from "../prototype/generate";
import { allowedFrom, assertClean, RejectedText } from "./guards";
import type { PrototypeOut } from "./schemas";

const AGES = [4, 19, 47, 95, 180, 340];

/** What the model is shown: the client's business in neutral terms. No quotes, no coaching, no readiness. */
export function prototypeFacts({ analysis, company, industry }: PrototypeInput) {
  const a = analysis.assessment;
  return {
    company,
    industry,
    problems: analysis.painPoints.map((p) => ({ title: p.title, reportedImpact: p.impact })),
    tools: analysis.tech.map((t) => ({ tool: t.tool, purpose: t.purpose })),
    processes: a.processes.map((p) => ({ label: p.label, hoursPerWeek: p.hoursPerWeek })),
    gaps: a.risks.map((r) => ({ label: r.label, severity: r.severity, tool: r.tool })),
    contentChannels: a.contentChannels,
  };
}

export function applyPrototypeContent(out: PrototypeOut, base: GeneratedModule[], input: PrototypeInput): GeneratedModule[] {
  const facts = prototypeFacts(input);
  const allowed = allowedFrom([JSON.stringify(facts)], input.analysis.money.map((m) => m.amount));
  const known = new Map(input.analysis.tech.map((t) => [t.tool.toLowerCase(), t.tool]));

  assertClean(
    [
      out.nurture.summary,
      ...out.nurture.basis,
      ...out.nurture.contacts.flatMap((c) => [c.label, c.stage, c.nextAction]),
      out.content.summary,
      ...out.content.channels,
      out.content.voice,
      ...out.content.drafts.flatMap((d) => [d.channel, d.topic, d.body]),
      out.security.summary,
      ...out.security.feed.flatMap((f) => [f.title, f.detail, f.tool ?? ""]),
    ],
    allowed,
  );

  const built: Record<"nurture" | "content" | "security", unknown> = {
    nurture: {
      summary: out.nurture.summary,
      basis: out.nurture.basis,
      contacts: out.nurture.contacts.map((c, i) => ({ id: `n${i + 1}`, ...c, example: true })),
    },
    content: {
      summary: out.content.summary,
      channels: out.content.channels,
      voice: out.content.voice,
      drafts: out.content.drafts.map((d, i) => ({ id: `c${i + 1}`, ...d, example: true, status: "pending", edited: false })),
    },
    security: {
      summary: out.security.summary,
      feed: out.security.feed.map((f, i) => ({
        id: `s${i + 1}`,
        severity: f.severity,
        title: f.title,
        detail: f.detail,
        minutesAgo: AGES[i]!,
        // A tool is named only if the client named it.
        tool: f.tool ? (known.get(f.tool.toLowerCase()) ?? null) : null,
        example: true,
      })),
    },
  };

  return base.map((m) => {
    if (m.moduleType === "finance") return m;
    const parsed = MODULE_SCHEMAS[m.moduleType].safeParse(built[m.moduleType]);
    if (!parsed.success) throw new RejectedText(`${MODULE_TITLES[m.moduleType]} did not pass its schema`);
    return { ...m, data: parsed.data };
  });
}
