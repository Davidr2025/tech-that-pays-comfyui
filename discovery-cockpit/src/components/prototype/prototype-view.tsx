"use client";

import { WorkflowDiagram } from "@/components/diagrams/workflow-diagram";
import { accentOnWhite } from "@/lib/brand";
import { readableTextColor } from "@/lib/color";
import { PROTOTYPE_LABEL, type ModuleData, type PrototypeModuleView } from "@/lib/prototype/schema";
import { REVIEW_LABEL } from "@/lib/session-types";
import type { PrototypePayload } from "@/server/prototype";
import { ContentModule, FinanceModule, NurtureModule, SecurityModule } from "./modules";

/** Module renderers by type. A stored module whose type has no renderer here is skipped. */
const RENDERERS: { [K in ModuleData["type"]]: (props: { data: Extract<ModuleData, { type: K }>["data"] }) => React.ReactNode } = {
  nurture: NurtureModule,
  content: ContentModule,
  finance: FinanceModule,
  security: SecurityModule,
};

function renderModule(m: PrototypeModuleView) {
  switch (m.module.type) {
    case "nurture":
      return <RENDERERS.nurture data={m.module.data} />;
    case "content":
      return <RENDERERS.content data={m.module.data} />;
    case "finance":
      return <RENDERERS.finance data={m.module.data} />;
    case "security":
      return <RENDERERS.security data={m.module.data} />;
  }
}

export function PrototypeView({ payload }: { payload: PrototypePayload }) {
  const { header } = payload;
  const onBrand = readableTextColor(header.brandColor);
  const accent = accentOnWhite(header.accentColor, header.brandColor);
  const tools = payload.tools.length >= 3 ? payload.tools : null;

  return (
    <div className="mx-auto max-w-5xl text-slate-900" style={{ ["--brand" as string]: header.brandColor, ["--accent" as string]: accent }}>
      <div role="note" className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border-2 border-dashed px-4 py-2.5 text-sm" style={{ borderColor: "var(--accent)" }} data-testid="prototype-banner">
        <span className="rounded px-2 py-0.5 text-xs font-bold tracking-widest text-white" style={{ backgroundColor: "var(--accent)" }}>
          {PROTOTYPE_LABEL}
        </span>
        <span>
          A concept built from your {payload.kind === "DISCOVERY" ? "conversation" : "assessment"}. Rows marked <strong>Example</strong> are illustrative, not your data.
        </span>
      </div>

      <header className="flex items-start justify-between gap-6 rounded-t-lg px-8 py-7" style={{ backgroundColor: header.brandColor, color: onBrand }}>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-widest opacity-80">{REVIEW_LABEL[payload.kind]} · Prototype dashboard</p>
          <h1 className="mt-1 text-2xl font-bold">{header.clientCompany}</h1>
          <p className="mt-1 text-sm opacity-90">A proposed system, designed by {header.businessName}</p>
        </div>
        {header.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- a validated data: URL
          <img src={header.logoUrl} alt={`${header.businessName} logo`} className="h-14 max-w-[9rem] shrink-0 rounded bg-white object-contain p-1.5" />
        )}
      </header>

      <div className="rounded-b-lg border border-t-0 bg-white px-6 pb-8 pt-6 sm:px-8">
        {tools && (
          <section aria-labelledby="diagram-heading" className="mb-8">
            <h2 id="diagram-heading" className="mb-3 border-b pb-1 text-lg font-semibold" style={{ borderColor: "var(--brand)" }}>
              From scattered to connected
            </h2>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
              <figure className="min-w-0 rounded-md border bg-amber-50/40 p-3">
                <figcaption className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-800">Today</figcaption>
                <WorkflowDiagram tools={tools} variant="tangled" label={`Today: ${tools.length} tools wired together by hand`} />
              </figure>
              <figure className="min-w-0 rounded-md border p-3" style={{ borderColor: "var(--brand)" }}>
                <figcaption className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--brand)" }}>
                  Proposed
                </figcaption>
                <WorkflowDiagram tools={tools} variant="connected" label={`Proposed: the same ${tools.length} tools feeding one dashboard`} />
              </figure>
            </div>
          </section>
        )}

        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-2" data-testid="module-grid">
          {payload.modules.map((m) => (
            <section key={m.id} className="min-w-0 rounded-lg border p-4" data-testid="module" data-module={m.module.type} aria-labelledby={`h-${m.id}`}>
              <h2 id={`h-${m.id}`} className="mb-2 flex items-center justify-between gap-2 text-base font-semibold">
                {m.title}
                <span className="rounded border px-1.5 py-0.5 text-[10px] font-bold tracking-widest text-slate-500">{PROTOTYPE_LABEL}</span>
              </h2>
              {renderModule(m)}
            </section>
          ))}
        </div>

        <footer className="mt-8 border-t pt-4 text-xs text-slate-500">
          Prepared by {header.businessName} for {header.clientCompany}. This is a prototype to discuss, not a finished system.
        </footer>
      </div>
    </div>
  );
}
