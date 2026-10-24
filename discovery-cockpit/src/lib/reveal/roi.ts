/**
 * Conservative time-and-money estimates for the client review.
 *
 * Every number traces back to something the client said, except two labelled planning
 * assumptions (working weeks per year, the share of time automation returns) and an optional
 * hourly value the consultant sets on the client. Nothing here is a forecast.
 */
import type { Analysis } from "../mock-ai/types";

export const WEEKS_PER_YEAR = 48;
export const RECOVERY_RATE = 0.5;

export interface TimeSink {
  title: string;
  hoursPerWeek: number;
}

export interface TimeEstimate {
  sinks: TimeSink[];
  hoursPerWeek: number;
  hoursPerYear: number;
  recoverableHoursPerYear: number;
  hourlyValue: number | null;
  recoverableValue: number | null;
}

export interface StatedCost {
  title: string;
  annualAmount: number;
  /** The client's own framing, e.g. "about $4,000 per month". */
  stated: string;
}

/** Hours the client put a number on. One statement is counted once, even if it describes two problems. */
export function timeSinksFrom(analysis: Pick<Analysis, "painPoints" | "assessment">): TimeSink[] {
  const seen = new Set<string>();
  const sinks: TimeSink[] = [];
  for (const p of analysis.painPoints) {
    if (p.weeklyHours === null || p.weeklyHours <= 0) continue;
    const key = p.hoursSource ?? `${p.id}:${p.weeklyHours}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sinks.push({ title: p.title, hoursPerWeek: p.weeklyHours });
  }
  // A team-wide admin figure overlaps the per-problem hours, so it is only used on its own.
  const admin = analysis.assessment.adminHoursPerWeek;
  if (!sinks.length && admin !== null && admin > 0) {
    sinks.push({ title: "Administrative work across the team", hoursPerWeek: Math.round(admin * 10) / 10 });
  }
  return sinks;
}

export function statedCostsFrom(analysis: Pick<Analysis, "painPoints">): StatedCost[] {
  return analysis.painPoints
    .filter((p) => p.annualAmount !== null && p.annualAmount > 0 && p.impact)
    .map((p) => ({ title: p.title, annualAmount: p.annualAmount!, stated: p.impact! }));
}

export function computeTimeEstimate(sinks: TimeSink[], hourlyValue: number | null): TimeEstimate | null {
  if (!sinks.length) return null;
  const hoursPerWeek = Math.round(sinks.reduce((sum, s) => sum + s.hoursPerWeek, 0) * 10) / 10;
  const hoursPerYear = Math.round(hoursPerWeek * WEEKS_PER_YEAR);
  const recoverableHoursPerYear = Math.round(hoursPerYear * RECOVERY_RATE);
  return {
    sinks,
    hoursPerWeek,
    hoursPerYear,
    recoverableHoursPerYear,
    hourlyValue,
    recoverableValue: hourlyValue === null ? null : Math.round(recoverableHoursPerYear * hourlyValue),
  };
}
