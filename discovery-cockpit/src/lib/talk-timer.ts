export const TARGET_MIN_SEC = 20;
export const TARGET_MAX_SEC = 60;
export const TARGET_DEFAULT_SEC = 30;

/** True once the consultant has talked past the target without handing back. */
export function isOverTarget(elapsedMs: number, targetSec: number): boolean {
  return elapsedMs > targetSec * 1000;
}

/** 0..1 progress toward the target, capped at 1. */
export function timerProgress(elapsedMs: number, targetSec: number): number {
  return Math.min(1, elapsedMs / (targetSec * 1000));
}

/** Healthy discovery calls keep the consultant at or under ~40% of the words. */
export function talkRatioTone(consultantPct: number): "good" | "watch" | "high" {
  if (consultantPct <= 40) return "good";
  if (consultantPct <= 55) return "watch";
  return "high";
}
