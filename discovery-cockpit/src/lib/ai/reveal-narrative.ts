/**
 * Lets a model reword the reveal without letting it change what the reveal SAYS in numbers.
 *
 * The base reveal is built by the app (and has already passed the strict allow-list schema). The model sees only
 * that client-safe payload and may rewrite five things: the summary, each problem's detail, the current- and
 * future-state lists and up to three next steps. Titles, totals, ROI, tech rows, money, timeline, header and booking
 * are copied from the base. The result must pass the same strict schema again, and the new wording must not
 * introduce a figure, a promise, a private term or a contact detail.
 */
import { revealSchema, type RevealData } from "../reveal/schema";
import { allowedFrom, assertClean, RejectedText } from "./guards";
import type { Narrative } from "./schemas";

/** The only part of a reveal the model is shown: the client-safe content, without branding, links or timestamps. */
export function narrativeInput(base: RevealData) {
  return {
    kind: base.kind,
    clientName: base.header.clientName,
    clientCompany: base.header.clientCompany,
    consultantName: base.header.consultantName,
    summary: base.summary,
    timeline: base.timeline,
    painPoints: base.painPoints,
    currentState: base.currentState,
    futureState: base.futureState,
    techStack: base.techStack.map((t) => ({ tool: t.tool, purpose: t.purpose })),
    totals: base.totals,
    statedCosts: base.roi?.statedCosts ?? [],
    estimate: base.roi?.time ? { hoursPerWeek: base.roi.time.hoursPerWeek, recoverableHoursPerYear: base.roi.time.recoverableHoursPerYear } : null,
  };
}

export function applyNarrative(base: RevealData, n: Narrative): RevealData {
  if (base.painPoints.length === 0) throw new RejectedText("nothing to reword");
  if (n.painPoints.length !== base.painPoints.length) throw new RejectedText("wrong number of problem details");

  const allowed = allowedFrom([JSON.stringify(narrativeInput(base)), ...base.nextSteps, ...(base.roi?.assumptions ?? [])], base.moneyMentioned.map((m) => m.amount));
  const nextSteps = [...n.nextSteps, ...base.nextSteps.slice(-1)];
  const candidate = {
    ...base,
    summary: n.summary,
    painPoints: base.painPoints.map((p, i) => ({ title: p.title, detail: n.painPoints[i]!.detail })),
    currentState: n.currentState.length ? n.currentState : base.currentState,
    futureState: n.futureState.length ? n.futureState : base.futureState,
    nextSteps,
  };
  assertClean([candidate.summary, ...candidate.painPoints.map((p) => p.detail), ...candidate.currentState, ...candidate.futureState, ...n.nextSteps], allowed, { allowMoney: false });

  const parsed = revealSchema.safeParse(candidate);
  if (!parsed.success) throw new RejectedText("did not pass the reveal schema");
  return parsed.data;
}
