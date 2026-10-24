/**
 * Client-facing reveal document. Pure presentational component: it can only render the
 * fields of the allow-listed RevealData type, so it has nothing private to show.
 * (No hooks, no data fetching — keeps it renderable by tests and print-friendly.)
 */
import { WorkflowDiagram } from "@/components/diagrams/workflow-diagram";
import { accentOnWhite } from "@/lib/brand";
import { readableTextColor } from "@/lib/color";
import { formatMoney, formatPeriod } from "@/lib/format";
import type { RevealData } from "@/lib/reveal/schema";
import { REVIEW_LABEL } from "@/lib/session-types";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="reveal-section mt-8">
      <h2 className="mb-3 border-b pb-1 text-lg font-semibold" style={{ borderColor: "var(--brand)" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-dashed p-3 text-sm text-slate-500">{children}</p>;
}

export function RevealView({ data }: { data: RevealData }) {
  const { header, totals } = data;
  const date = new Date(data.generatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const onBrand = readableTextColor(header.brandColor);
  const accent = accentOnWhite(header.accentColor, header.brandColor);
  // Three or more tools make a meaningful picture; fewer would just be a line.
  const diagramTools = data.techStack.length >= 3 ? data.techStack.map((t) => t.tool) : null;

  return (
    <article
      className="reveal-doc mx-auto max-w-3xl overflow-hidden rounded-lg border bg-white text-slate-900 shadow-sm"
      style={{ ["--brand" as string]: header.brandColor, ["--accent" as string]: accent }}
    >
      <header className="flex items-start justify-between gap-6 px-8 py-7" style={{ backgroundColor: header.brandColor, color: onBrand }}>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-widest opacity-80">{REVIEW_LABEL[data.kind]}</p>
          <h1 className="mt-1 text-2xl font-bold">{header.businessName}</h1>
          {header.tagline && <p className="mt-0.5 text-sm opacity-90">{header.tagline}</p>}
          <p className="mt-4 text-sm opacity-90">
            Prepared for {header.clientName}, {header.clientCompany} · {date}
          </p>
        </div>
        {header.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- a validated data: URL; next/image adds nothing here
          <img src={header.logoUrl} alt={`${header.businessName} logo`} className="h-14 max-w-[9rem] shrink-0 rounded bg-white object-contain p-1.5" />
        )}
      </header>

      <div className="px-8 pb-8">
        <Section title="What We Heard">
          <p className="leading-relaxed">{data.summary}</p>
          {(data.timeline.deadline || data.timeline.window) && (
            <dl className="avoid-break mt-4 flex flex-wrap gap-x-8 gap-y-2 rounded-md border px-4 py-3 text-sm" style={{ borderColor: "var(--accent)" }}>
              {data.timeline.deadline && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Target date</dt>
                  <dd className="font-semibold">{data.timeline.deadline}</dd>
                </div>
              )}
              {data.timeline.window && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Looking to move within</dt>
                  <dd className="font-semibold">{data.timeline.window}</dd>
                </div>
              )}
            </dl>
          )}
        </Section>

        <Section title="What's Getting in the Way">
          {data.painPoints.length === 0 ? (
            <Empty>No specific challenges were captured in this conversation.</Empty>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {data.painPoints.map((p) => (
                <li key={p.title} className="avoid-break rounded-md border p-3" style={{ borderLeft: "4px solid var(--brand)" }}>
                  <p className="font-medium">{p.title}</p>
                  <p className="mt-1 text-sm text-slate-600">{p.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="The Numbers You Mentioned">
          {data.moneyMentioned.length === 0 ? (
            <Empty>No dollar figures were mentioned in this conversation.</Empty>
          ) : (
            <ul className="divide-y rounded-md border">
              {data.moneyMentioned.map((m, i) => (
                <li key={i} className="avoid-break flex gap-4 px-3 py-2 text-sm">
                  <span className="w-32 shrink-0 font-semibold tabular-nums">
                    {formatMoney(m.amount)}
                    {formatPeriod(m.period) && <span className="ml-1 text-xs font-normal text-slate-500">{formatPeriod(m.period)}</span>}
                  </span>
                  <span className="text-slate-700">“{m.context}”</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Your Current Tools">
          {data.techStack.length === 0 ? (
            <Empty>No software tools were named in this conversation.</Empty>
          ) : (
            <>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3 font-medium">Tool</th>
                    <th className="py-2 pr-3 font-medium">What it&apos;s for</th>
                    <th className="py-2 pr-3 text-right font-medium">Monthly</th>
                    <th className="py-2 text-right font-medium">Annual</th>
                  </tr>
                </thead>
                <tbody>
                  {data.techStack.map((t) => (
                    <tr key={t.tool} className="avoid-break border-b">
                      <td className="py-2 pr-3 font-medium">{t.tool}</td>
                      <td className="py-2 pr-3 text-slate-600">{t.purpose}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {t.monthlyCost === null ? <span className="text-slate-400">Not stated</span> : formatMoney(t.monthlyCost)}
                        {t.note && <span className="block text-xs text-slate-400">{t.note}</span>}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {t.annualCost === null ? <span className="text-slate-400">—</span> : formatMoney(t.annualCost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="avoid-break font-semibold">
                    <td className="py-2 pr-3" colSpan={2}>
                      Total
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums" data-testid="total-monthly">
                      {formatMoney(totals.monthly)}
                    </td>
                    <td className="py-2 text-right tabular-nums" data-testid="total-annual">
                      {formatMoney(totals.annual)}
                    </td>
                  </tr>
                </tfoot>
              </table>
              <p className="mt-2 text-xs text-slate-500">
                {totals.toolsWithCost === totals.toolsTotal
                  ? `Totals include all ${totals.toolsTotal} ${totals.toolsTotal === 1 ? "tool" : "tools"}.`
                  : `Totals include the ${totals.toolsWithCost} of ${totals.toolsTotal} tools with a stated cost.`}
              </p>
            </>
          )}
        </Section>

        <Section title="Where You Are Today vs. Where You Could Be">
          {data.currentState.length === 0 && data.futureState.length === 0 ? (
            <Empty>Not enough was discussed to describe a current and future state yet.</Empty>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="avoid-break rounded-md border bg-slate-50 p-4">
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Today</h3>
                {diagramTools && <WorkflowDiagram tools={diagramTools} variant="tangled" label={`Today: ${diagramTools.length} tools wired together by hand`} />}
                <ul className="list-disc space-y-1.5 pl-5 text-sm">
                  {data.currentState.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
              <div className="avoid-break rounded-md border p-4" style={{ borderColor: "var(--accent)" }}>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--accent)" }}>
                  Where we could get to
                </h3>
                {diagramTools && <WorkflowDiagram tools={diagramTools} variant="connected" label={`Where we could get to: the same ${diagramTools.length} tools feeding one place`} />}
                <ul className="list-disc space-y-1.5 pl-5 text-sm">
                  {data.futureState.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </Section>

        <footer className="mt-10 border-t pt-4 text-xs text-slate-500">
          Prepared by {header.consultantName}, {header.businessName} · {date}
        </footer>
      </div>
    </article>
  );
}
