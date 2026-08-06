import type { Step1Signals, Step2Assessment, PriorityDecision, PriorityLevel } from "./schemas";

/**
 * Deterministic priority rule table. Evaluated top-down; first match wins.
 * The LLM never sets priority directly — it only produces the signals and
 * assessment this table reads. Exported as data so the UI can display which
 * rule fired for a given decision.
 */
export interface PriorityRule {
  id: string;
  condition_description: string;
  level: PriorityLevel;
  test: (signals: Step1Signals, assessment: Step2Assessment) => boolean;
}

export const PRIORITY_RULE_TABLE: PriorityRule[] = [
  {
    id: "security-outage",
    condition_description: "Security incident or production outage → P0 (Security/outage policy)",
    level: "P0",
    test: (s) => s.security_incident || s.production_outage,
  },
  {
    id: "deadline-24h-external-or-revenue",
    condition_description:
      "Deadline within 24h + (external visibility or revenue impact) → P1",
    level: "P1",
    test: (s) => s.deadline_within_24h && (s.external_visibility || s.revenue_impact),
  },
  {
    id: "critical-business-impact",
    condition_description: "Business impact assessed as critical → P1",
    level: "P1",
    test: (_s, a) => a.business_impact === "critical",
  },
  {
    id: "deadline-wide-scope",
    condition_description:
      "Deadline detected + affected scope is multiple teams or company-wide → P1",
    level: "P1",
    test: (s) =>
      s.deadline_detected &&
      (s.affected_scope === "multiple_teams" || s.affected_scope === "company_wide"),
  },
  {
    id: "high-impact-or-wide-scope",
    condition_description:
      "Business impact is high, or affected scope is multiple teams / company-wide → P2",
    level: "P2",
    test: (s, a) =>
      a.business_impact === "high" ||
      s.affected_scope === "multiple_teams" ||
      s.affected_scope === "company_wide",
  },
  {
    id: "default",
    condition_description: "No higher-priority rule matched → P3 (default)",
    level: "P3",
    test: () => true,
  },
];

/**
 * Pure function: computes priority from extracted signals + assessment only.
 * Urgency CLAIMS embedded in the request text (including injection attempts)
 * never reach this function directly — only the vetted boolean/enum signals
 * do — so they cannot raise priority on their own.
 */
export function computePriority(
  signals: Step1Signals,
  assessment: Step2Assessment
): PriorityDecision {
  for (const rule of PRIORITY_RULE_TABLE) {
    if (rule.test(signals, assessment)) {
      return { level: rule.level, rule_fired: rule.condition_description };
    }
  }
  // Unreachable — the final rule in the table always matches.
  return { level: "P3", rule_fired: "No higher-priority rule matched → P3 (default)" };
}
