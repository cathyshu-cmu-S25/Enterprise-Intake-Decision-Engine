import type { PriorityLevel } from "@/lib/schemas";
import { SENSITIVE_INTAKE_REVIEW } from "@/lib/teams";

export const POLICY_VERSION = "2026-08-11.v1";

/**
 * A small declarative condition tree — deliberately NOT a general-purpose
 * rule language. No eval(), no dynamic code; lib/policyEval.ts evaluates
 * this with a plain switch over the variants below.
 */
export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { signal: string; equals: boolean }
  | { signal: string; in: string[] }
  | { assessment: string; in: string[] }
  | { always: true };

export interface PolicyRule {
  id: string;
  level: PriorityLevel;
  when: Condition;
  description: string; // shown in the UI and in evidence
}

/**
 * Priority rule table, evaluated top-down — first match wins. This is an
 * organisation-specific policy parameter, not an architectural choice, and
 * is expressed as data for exactly that reason: changing what "P0" means
 * should not require a code review of lib/priorityRules.ts.
 */
export const PRIORITY_POLICY: PolicyRule[] = [
  {
    id: "security-outage",
    level: "P0",
    when: {
      any: [
        { signal: "security_incident", equals: true },
        { signal: "production_outage", equals: true },
      ],
    },
    description: "Security incident or production outage → P0 (Security/outage policy)",
  },
  {
    id: "deadline-24h-external-or-revenue",
    level: "P1",
    when: {
      all: [
        { signal: "deadline_within_24h", equals: true },
        {
          any: [
            { signal: "external_visibility", equals: true },
            { signal: "revenue_impact", equals: true },
          ],
        },
      ],
    },
    description: "Deadline within 24h + (external visibility or revenue impact) → P1",
  },
  {
    id: "critical-business-impact",
    level: "P1",
    when: { assessment: "business_impact", in: ["critical"] },
    description: "Business impact assessed as critical → P1",
  },
  {
    id: "deadline-wide-scope",
    level: "P1",
    when: {
      all: [
        { signal: "deadline_detected", equals: true },
        { signal: "affected_scope", in: ["multiple_teams", "company_wide"] },
      ],
    },
    description: "Deadline detected + affected scope is multiple teams or company-wide → P1",
  },
  {
    id: "high-impact-or-wide-scope",
    level: "P2",
    when: {
      any: [
        { assessment: "business_impact", in: ["high"] },
        { signal: "affected_scope", in: ["multiple_teams", "company_wide"] },
      ],
    },
    description:
      "Business impact is high, or affected scope is multiple teams / company-wide → P2",
  },
  {
    id: "default",
    level: "P3",
    when: { always: true },
    description: "No higher-priority rule matched → P3 (default)",
  },
];

/**
 * Sensitive-category guardrail policy. `forced_review_signals` force routing
 * to `forced_team`, EXCEPT when an incident from `incident_precedence_signals`
 * is in progress — incident response owns the request; compliance is
 * notified downstream. Signals listed in `never_exempt_signals` are never
 * subject to that exemption (HR matters are never incident response).
 */
export const SENSITIVE_POLICY = {
  forced_review_signals: ["hr_sensitive", "legal_compliance_related"],
  incident_precedence_signals: ["security_incident", "production_outage"],
  never_exempt_signals: ["hr_sensitive"],
  forced_team: SENSITIVE_INTAKE_REVIEW,
};

/**
 * Confidence-gate policy. `never_block_signals` documents which signals
 * correspond to the priority rule that exempts a case from being blocked on
 * missing information (mirrors PRIORITY_POLICY's P0 rule) — the gate itself
 * still receives `is_p0` as a precomputed input, so this exists for policy
 * transparency and name validation, not as a second source of truth.
 */
export const GATE_POLICY = {
  missing_information_threshold: 2,
  clarify_on_multiple_intents: true,
  never_block_signals: ["security_incident", "production_outage"],
};
