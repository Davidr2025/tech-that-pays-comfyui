/**
 * A small in-memory limiter for sign-in attempts: `max` failures per key per window, then a lockout until
 * the oldest failure ages out. In memory means per server process: enough to stop online guessing on one
 * instance; put a shared limiter in front if you run several.
 */
export interface Limiter {
  /** Seconds to wait before another attempt, or 0 if allowed. */
  retryAfter(key: string): number;
  fail(key: string): void;
  clear(key: string): void;
}

export function makeLimiter({ max, windowMs, now = () => Date.now() }: { max: number; windowMs: number; now?: () => number }): Limiter {
  const failures = new Map<string, number[]>();
  const live = (key: string) => {
    const t = now();
    const recent = (failures.get(key) ?? []).filter((at) => t - at < windowMs);
    if (recent.length) failures.set(key, recent);
    else failures.delete(key);
    return recent;
  };
  return {
    retryAfter(key) {
      const recent = live(key);
      if (recent.length < max) return 0;
      return Math.max(1, Math.ceil((recent[0]! + windowMs - now()) / 1000));
    },
    fail(key) {
      failures.set(key, [...live(key), now()]);
      // Bound memory: forget the oldest keys if someone sprays many.
      if (failures.size > 10_000) failures.delete(failures.keys().next().value as string);
    },
    clear(key) {
      failures.delete(key);
    },
  };
}
