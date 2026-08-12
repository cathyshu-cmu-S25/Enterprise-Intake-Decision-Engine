import type { Step1Signals, ConfidenceLevel, GuardrailResult } from "../schemas";
import { SENSITIVE_POLICY } from "@/config/policy";
import { validateSignalNames } from "./policyEval";

validateSignalNames([
  ...SENSITIVE_POLICY.forced_review_signals,
  ...SENSITIVE_POLICY.incident_precedence_signals,
  ...SENSITIVE_POLICY.never_exempt_signals,
]);

/**
 * Deterministic guardrails over Step 1 signals. Runs independently of, and
 * cannot be overridden by, anything the LLM says in later steps. Each fired
 * guardrail produces a human-readable evidence entry for the audit trail.
 */
export function applyGuardrails(signals: Step1Signals): GuardrailResult {
  const evidence: string[] = [];
  const events: { action: string; reason: string }[] = [];
  let forced_team: string | null = null;
  let confidence_cap: ConfidenceLevel | null = null;
  let block_spend_commitment = false;

  const getSignal = (name: string): boolean =>
    (signals as unknown as Record<string, unknown>)[name] === true;
  const isExempt = (name: string): boolean => SENSITIVE_POLICY.never_exempt_signals.includes(name);

  // Incident response takes precedence over sensitive-category routing.
  // A security incident with privacy implications is still a security
  // incident; legal/compliance is notified downstream, it does not become
  // the owner. Signals in never_exempt_signals (HR) are never subject to
  // this suppression — HR matters are never incident response.
  const incidentInProgress = SENSITIVE_POLICY.incident_precedence_signals.some(getSignal);

  const shouldForce = SENSITIVE_POLICY.forced_review_signals.some(
    (name) => getSignal(name) && (isExempt(name) || !incidentInProgress)
  );

  if (shouldForce) {
    forced_team = SENSITIVE_POLICY.forced_team;
    const reason = "Sensitive category detected → human review (policy)";
    evidence.push(reason);
    events.push({
      action: `Routing forced to "${SENSITIVE_POLICY.forced_team}"`,
      reason,
    });
  }

  // Suppressing a guardrail is itself a decision and must appear in the
  // audit trail — not just the cases where it fires.
  const suppressedByIncident = SENSITIVE_POLICY.forced_review_signals.some(
    (name) => getSignal(name) && !isExempt(name) && incidentInProgress
  );
  if (suppressedByIncident) {
    evidence.push(
      "Legal/compliance implications noted; routing retained with the incident owner " +
        "(policy: incident response precedes compliance review)."
    );
  }

  if (signals.budget_commitment_requested) {
    block_spend_commitment = true;
    const reason =
      "Budget commitment requested; response draft must not commit spend";
    evidence.push(reason);
    events.push({ action: "Spend-commitment language blocked", reason });
  }

  if (signals.injection_indicators) {
    confidence_cap = "medium";
    const reason =
      "Instruction-like content detected in request; treated as data, not commands";
    evidence.push(reason);
    events.push({ action: "Confidence capped at medium", reason });
  }

  return { forced_team, block_spend_commitment, confidence_cap, evidence, events };
}
