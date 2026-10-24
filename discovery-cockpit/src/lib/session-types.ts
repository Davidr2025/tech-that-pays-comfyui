export const SESSION_TYPES = ["DISCOVERY", "OPERATIONAL_ASSESSMENT", "TECHNOLOGY_ASSESSMENT", "COMBINED_ASSESSMENT"] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

export interface SessionTypeInfo {
  label: string;
  description: string;
  /** Has a question bank and engine support yet. */
  available: boolean;
}

export const SESSION_TYPE_INFO: Record<SessionType, SessionTypeInfo> = {
  DISCOVERY: { label: "Discovery call", description: "A first conversation: pain points, tools, budget, timeline, who decides.", available: true },
  OPERATIONAL_ASSESSMENT: { label: "Operational assessment", description: "Process-by-process review of how the work actually runs.", available: false },
  TECHNOLOGY_ASSESSMENT: { label: "Technology assessment", description: "Tool-by-tool review of the stack, its cost and its overlap.", available: false },
  COMBINED_ASSESSMENT: { label: "Combined assessment", description: "Operations and technology in a single session.", available: false },
};

export const ASSESSMENT_PENDING = "Assessment sessions need their own question banks and a prototype dashboard, which come with assessment mode.";
