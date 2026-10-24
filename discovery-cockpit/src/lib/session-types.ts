export const SESSION_TYPES = ["DISCOVERY", "OPERATIONAL_ASSESSMENT", "TECHNOLOGY_ASSESSMENT", "COMBINED_ASSESSMENT"] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

export interface SessionTypeInfo {
  label: string;
  description: string;
  /** Selectable when starting a session. */
  available: boolean;
}

export const SESSION_TYPE_INFO: Record<SessionType, SessionTypeInfo> = {
  DISCOVERY: { label: "Discovery call", description: "A first conversation: pain points, tools, budget, timeline, who decides.", available: true },
  OPERATIONAL_ASSESSMENT: { label: "Operational assessment", description: "Process-by-process review of how the work actually runs.", available: true },
  TECHNOLOGY_ASSESSMENT: { label: "Technology assessment", description: "Tool-by-tool review of the stack, its cost and its overlap.", available: true },
  COMBINED_ASSESSMENT: { label: "Combined assessment", description: "Operations and technology in a single session.", available: true },
};

/** Which assessment types produce the prototype dashboard. */
export const ASSESSMENT_TYPES: readonly SessionType[] = ["OPERATIONAL_ASSESSMENT", "TECHNOLOGY_ASSESSMENT", "COMBINED_ASSESSMENT"];
export const isAssessment = (type: SessionType) => ASSESSMENT_TYPES.includes(type);

/** The eyebrow on the client review. */
export const REVIEW_LABEL: Record<SessionType, string> = {
  DISCOVERY: "Discovery Review",
  OPERATIONAL_ASSESSMENT: "Operational Assessment",
  TECHNOLOGY_ASSESSMENT: "Technology Assessment",
  COMBINED_ASSESSMENT: "Assessment Review",
};
