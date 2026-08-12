import type { ConfidenceLevel, GateDecision } from "../schemas";
import { GATE_POLICY } from "@/config/policy";
import { validateSignalNames } from "./policyEval";

validateSignalNames(GATE_POLICY.never_block_signals);

export interface ConfidenceGateInput {
  missing_information_count: number;
  multiple_intents: boolean;
  // True when the deterministic priority rule fired P0. Conceptually this
  // corresponds to GATE_POLICY.never_block_signals firing PRIORITY_POLICY's
  // P0 rule upstream — passed in precomputed rather than re-derived here so
  // this function has a single, simple signature.
  is_p0: boolean;
  injection_cap: ConfidenceLevel | null; // "medium" when guardrails capped confidence
  forced_review: boolean; // true when guardrails force routing to human review (hr_sensitive / legal_compliance_related)
}

/**
 * Deterministic confidence gate. Decides whether the pipeline has enough
 * information to proceed to a real routing decision, or should stop and
 * ask clarifying questions instead. Thresholds are read from
 * config/policy.ts's GATE_POLICY rather than hardcoded here.
 *
 * Exceptions — these always proceed (never block on missing info), but the
 * confidence *label* is still computed honestly by the same rules, so a case
 * can still show as "low confidence, proceeding anyway" in the UI:
 * - P0 signals (security incident / production outage).
 * - forced_review cases (hr_sensitive / legal_compliance_related): sensitive
 *   matters must route straight to human review rather than interrogating
 *   a distressed requester with clarifying questions.
 */
export function computeConfidenceGate(input: ConfidenceGateInput): GateDecision {
  const { missing_information_count, multiple_intents, is_p0, injection_cap, forced_review } =
    input;

  const tooManyMissing = missing_information_count >= GATE_POLICY.missing_information_threshold;
  const multiIntentTriggersLow = GATE_POLICY.clarify_on_multiple_intents && multiple_intents;

  let confidence: ConfidenceLevel;
  let reason: string;

  if ((tooManyMissing && !is_p0) || multiIntentTriggersLow) {
    confidence = "low";
    reason = multiIntentTriggersLow
      ? "Request contains multiple distinct intents; needs clarification before proceeding."
      : `${missing_information_count} pieces of information are missing; needs clarification before proceeding.`;
  } else if (missing_information_count === 1 || injection_cap) {
    confidence = "medium";
    reason = injection_cap
      ? "Confidence capped at medium: instruction-like content detected in the request, treated as data, not commands."
      : "One piece of information is missing.";
  } else {
    confidence = "high";
    reason = "All necessary information present; no ambiguity signals detected.";
  }

  const proceed = is_p0 || forced_review ? true : confidence !== "low";

  if (confidence === "low" && proceed) {
    reason += is_p0
      ? " Proceeding regardless: P0 security/outage signals are never blocked on missing information."
      : " Proceeding regardless: sensitive matters route to human review immediately rather than being interrogated by an automated system.";
  }

  return { confidence, reason, proceed };
}
