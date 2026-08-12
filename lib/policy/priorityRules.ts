import type { Step1Signals, Step2Assessment, PriorityDecision } from "../schemas";
import { PRIORITY_POLICY } from "@/config/policy";
import { evaluateCondition, validatePolicy } from "./policyEval";

// Fail fast at module load if the policy references a signal/assessment
// field that doesn't exist — an authoring bug, not something to discover
// mid-request.
validatePolicy(PRIORITY_POLICY);

/**
 * Pure function: computes priority from extracted signals + assessment only,
 * evaluated top-down against config/policy.ts's PRIORITY_POLICY — first
 * match wins. The LLM never sets priority directly; it only produces the
 * signals and assessment this table reads.
 *
 * Urgency CLAIMS embedded in the request text (including injection attempts)
 * never reach this function directly — only the vetted boolean/enum signals
 * do — so they cannot raise priority on their own.
 */
export function computePriority(
  signals: Step1Signals,
  assessment: Step2Assessment
): PriorityDecision {
  for (const rule of PRIORITY_POLICY) {
    if (evaluateCondition(rule.when, signals, assessment)) {
      return { level: rule.level, rule_fired: rule.description };
    }
  }
  // Unreachable — PRIORITY_POLICY's final rule is { always: true }.
  return { level: "P3", rule_fired: "No higher-priority rule matched → P3 (default)" };
}
