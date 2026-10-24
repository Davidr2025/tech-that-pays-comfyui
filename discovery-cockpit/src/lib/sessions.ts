/**
 * Session lifecycle, defined in ONE place.
 *
 *   SETUP -> LIVE -> REVIEW -> REVEALED -> COMPLETED
 *
 * Going back is allowed only where the data really goes back: loading a new transcript
 * discards the review (-> LIVE); rebuilding a review after it was shown needs showing again
 * (REVEALED -> REVIEW). COMPLETED is final.
 */
export const SESSION_STATUSES = ["SETUP", "LIVE", "REVIEW", "REVEALED", "COMPLETED"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

const ALLOWED: Record<SessionStatus, readonly SessionStatus[]> = {
  SETUP: ["LIVE"],
  LIVE: ["REVIEW"],
  REVIEW: ["REVEALED", "LIVE", "COMPLETED"],
  REVEALED: ["REVIEW", "LIVE", "COMPLETED"],
  COMPLETED: [],
};

export function canTransition(from: SessionStatus, to: SessionStatus): boolean {
  return from === to || ALLOWED[from].includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(
    public from: SessionStatus,
    public to: SessionStatus,
  ) {
    super(from === "COMPLETED" ? "This session is complete. Start a new session instead." : `A session cannot go from ${from} to ${to}.`);
  }
}

export function assertTransition(from: SessionStatus, to: SessionStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

export const STATUS_LABEL: Record<SessionStatus, string> = {
  SETUP: "Ready",
  LIVE: "Live",
  REVIEW: "Review built",
  REVEALED: "Revealed",
  COMPLETED: "Complete",
};

/** Statuses the consultant may set by hand; the rest follow from actions. */
export const MANUAL_TARGETS: readonly SessionStatus[] = ["REVEALED", "COMPLETED"];
