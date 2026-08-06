import type { ConfidenceLevel, GateDecision } from "./schemas";

export interface ConfidenceGateInput {
  missing_information_count: number;
  multiple_intents: boolean;
  is_p0: boolean; // true when the deterministic priority rule fired P0
  injection_cap: ConfidenceLevel | null; // "medium" when guardrails capped confidence
}

/**
 * Deterministic confidence gate. Decides whether the pipeline has enough
 * information to proceed to a real routing decision, or should stop and
 * ask clarifying questions instead.
 *
 * Exception: P0 signals always proceed (never block a security incident on
 * missing info) — but the confidence *label* is still computed honestly by
 * the same rules, so a P0 case can still show as "low confidence, proceeding
 * anyway" in the UI.
 */
export function computeConfidenceGate(input: ConfidenceGateInput): GateDecision {
  const { missing_information_count, multiple_intents, is_p0, injection_cap } = input;

  let confidence: ConfidenceLevel;
  let reason: string;

  if ((missing_information_count >= 2 && !is_p0) || multiple_intents) {
    confidence = "low";
    reason = multiple_intents
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

  const proceed = is_p0 ? true : confidence !== "low";

  if (is_p0 && confidence === "low") {
    reason +=
      " Proceeding regardless: P0 security/outage signals are never blocked on missing information.";
  }

  return { confidence, reason, proceed };
}
