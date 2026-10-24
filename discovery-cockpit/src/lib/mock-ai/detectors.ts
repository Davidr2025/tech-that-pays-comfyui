/**
 * Topic detectors: how the mock engine decides a question's topic has been covered. One entry
 * per question topic across all banks (discovery, operations, technology); a session only runs
 * the detectors for its own bank. Detection is deliberately simple: regexes over the transcript
 * so far, optionally restricted to who said it.
 */
import type { AssessmentFacts } from "./assessment";

export type Ctx = {
  any: (re: RegExp) => boolean;
  client: (re: RegExp) => boolean;
  /** A consultant sentence that is actually a question (ends in "?") matching `re`. */
  asks: (re: RegExp) => boolean;
  painIds: Set<string>;
  hasCostedTool: boolean;
  costedToolCount: number;
  assessment: AssessmentFacts;
};

const WEEKLY_TIME = /\b(\w+ )?(hours?|days?) (a|per) week\b/i;

const DISCOVERY: Record<string, (c: Ctx) => boolean> = {
  context: (c) => c.any(/\bhow \w+ runs today\b|walk me through the business|tell me (a bit )?about \w+( \w+)* and who you serve|who you serve|how money comes in/i),
  time_sinks: (c) => c.client(WEEKLY_TIME) || c.any(/\btime sinks?\b/i),
  manual_processes: (c) => c.client(/\bby hand\b|\bmanual(ly)?\b|\bexports? csvs?\b|\bcopy[- ]and[- ]paste\b|\bre-?(enter|key|typ)\w*\b|\btypes? (it|them) (all )?into\b/i),
  volume_spikes: (c) => c.any(/\bvolume spikes?\b|\bwhat breaks first\b|\bpeak (season|volume)\b|\bbusy season\b/i),
  tool_stack: (c) => c.asks(/\b(tool stack|software|tools?|apps?|subscriptions?)\b/i) || c.hasCostedTool,
  tool_overlap: (c) => c.any(/\boverlap\b|\bsame job\b|\btwo tools\b|\bboth places\b|\bpaying for two\b/i),
  lead_leakage: (c) => c.painIds.has("lead_followup") || c.any(/\bleads?\b[^.?]{0,40}\b(slip|cracks?|lose|lost|die|go cold)\b/i),
  close_rate: (c) => c.any(/\bclose rate\b|\bproposal to signed\b|\bone in (two|three|four|five)\b/i),
  quality_dips: (c) => c.client(/\b(wrong|mistakes?|errors?|embarrass\w*|typo|sloppy|spotted it|client noticed)\b/i) || c.asks(/quality dip|notice a mistake/i),
  team_resistance: (c) => c.any(/\bresist\w*|\bburn(ed|t)\b|\btried automation\b|\bbroke during\b|\bhated it\b|\bcautious\b/i),
  decision_timeline: (c) => c.any(/\bwho else\b|\bdecision\b|\bdecide\b|\btimeline\b|\bsign off\b|\bmy call\b|\bfinal call\b/i),
  one_fix: (c) => c.any(/\bexactly one thing\b|\bno-brainer\b|\bnext 90 days\b|\bone thing\b/i),
};

const OPERATIONS: Record<string, (c: Ctx) => boolean> = {
  ops_flow: (c) => c.any(/\bfirst contact to (the )?final invoice\b|\btypical (client )?engagement\b/i),
  ops_owners: (c) => c.any(/\bwho owns\b|\bnobody covers\b|\bwhen (that person|someone|she|he) (is|was) (out|sick|away)\b/i),
  ops_intake: (c) => c.asks(/\b(inquiry|new lead)\b/i) || c.client(/\b(reply|respond(ed)?|answered)\b[^.]{0,50}\b(hour|morning|weekend|monday|same day)\b/i),
  ops_followup: (c) => c.asks(/follow[- ]?up/i) || c.client(/\bsecond email\b|\bnobody follows? up\b|\bnothing triggers\b/i),
  ops_proposals: (c) => c.any(/\bproposals?\b[^.?]{0,60}\b(build|built|takes?|took|put together)\b|\bhow (a )?proposal gets built\b/i),
  ops_onboarding: (c) => c.any(/\bonboarding\b/i),
  ops_handoffs: (c) => c.any(/\bhand-?offs?\b|\bapprovals?\b|\bsit in my inbox\b|\bwaits? (for|on)\b/i),
  ops_reporting: (c) => c.asks(/\breports?\b/i) || c.client(/\bwrites? the commentary\b|\bexports? the numbers\b/i),
  ops_content: (c) => c.any(/\b(linkedin|newsletter)\b|\bcontent\b[^.?]{0,40}\b(planned|written|published)\b/i),
  ops_billing: (c) => c.asks(/\binvoices?\b/i) || c.client(/\bchasing happens\b|\bcreates? them in\b/i),
  ops_receivables: (c) => c.any(/\boutstanding\b|\breceivables?\b|\b\d+ days old\b/i),
  ops_payroll: (c) => c.any(/\bpayroll\b/i),
  ops_repeatable: (c) => c.asks(/same way every time|done by hand/i),
  ops_errors: (c) => c.any(/\bwent out late\b|\bgo wrong\b|\bforgot\b|\bmistake\b|\bclient (noticed|spotted)\b/i),
  ops_capacity: (c) => c.any(/\bwhat breaks first\b|\banother large client\b|\bworking weekends\b/i),
  ops_metrics: (c) => c.any(/\bwhich numbers\b|\bnumbers do you look at\b|\blive in (three|four|five|several) places\b/i),
  ops_knowledge: (c) => c.any(/\bknow-how\b|\bwritten down\b|\bin my head\b/i),
  ops_promises: (c) => c.any(/\bpromised\b|\bpromises\b/i),
  ops_adminhours: (c) => c.any(/\badmin that isn'?t billable\b|\bhours a week\b[^.]{0,30}\badmin\b|\badmin\b[^.]{0,30}\bhours a week\b/i),
  ops_priority: (c) => c.asks(/fixed in the next 90 days|pay back fastest/i),
};

const TECHNOLOGY: Record<string, (c: Ctx) => boolean> = {
  tech_inventory: (c) => c.costedToolCount >= 3 || c.asks(/\bevery tool\b|\btools? you pay for\b/i),
  tech_usage: (c) => c.any(/\bopen every day\b|\bbarely used\b|\bnobody (uses|opens)\b/i),
  tech_duplicates: (c) => c.any(/\bdoing the same job\b|\bboth (send|track)\b|\boverlap\b/i),
  tech_source: (c) => c.any(/\bsingle source of truth\b|\bwhich copy\b|\bclient data live\b|\btrust none of them\b/i),
  tech_integrations: (c) => c.any(/\bconnected to each other\b|\bconnections have broken\b|\bzaps? break\b|\bconnects the\b/i),
  tech_automation: (c) => c.asks(/runs? automatically|maintains it/i) || c.client(/\bzaps? break\b/i),
  tech_spreadsheets: (c) => c.asks(/spreadsheets/i) || c.client(/\bpayroll spreadsheet\b|\bspreadsheet\b[^.]{0,40}\b(depend|rely)/i),
  tech_numbers: (c) => c.any(/\bclient asks for a number\b|\bpulls it from\b/i),
  tech_ai: (c) => c.any(/\bchatgpt\b|\bai tools?\b|\bclaude\b|\bcopilot\b/i),
  tech_access: (c) => c.any(/\badmin access\b|\bwhat happens to access\b|\bstill has access\b|\bnobody removed\b/i),
  tech_passwords: (c) => c.any(/\bshared login\b|\bshares? one\b[^.]{0,30}\blogin\b|\bpasswords?\b/i),
  tech_mfa: (c) => c.any(/\bmulti-?factor\b|\bmfa\b|\b2fa\b|\btwo[- ]factor\b/i),
  tech_backup: (c) => c.any(/\bbacked up\b|\bbackups?\b|\brestore\b/i),
  tech_devices: (c) => c.any(/\bdevices touch\b|\bown laptops\b|\bpersonal (accounts|devices|laptops)\b|\bown computers\b/i),
  tech_vendors: (c) => c.any(/\bvendors? (hold|have)\b|\bcontracts say\b/i),
  tech_support: (c) => c.any(/\bfixes things\b|\bwhoever notices\b/i),
  tech_pastfail: (c) => c.any(/\bfailed before\b|\bbroke during a launch\b|\bcost us a week\b/i),
  tech_spend: (c) => c.any(/\bspend on technology\b|\bapproves? a new tool\b/i),
  tech_datapath: (c) => c.any(/\bads, crm and billing\b|\binto one view\b/i),
  tech_wish: (c) => c.any(/\bworked perfectly\b|\bmonday morning\b/i),
};

export const TOPIC_DETECTORS: Record<string, (c: Ctx) => boolean> = { ...DISCOVERY, ...OPERATIONS, ...TECHNOLOGY };
