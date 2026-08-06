import type { Step1Signals, ConfidenceLevel, GuardrailResult } from "./schemas";
import { SENSITIVE_INTAKE_REVIEW } from "./teams";

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

  if (signals.hr_sensitive || signals.legal_compliance_related) {
    forced_team = SENSITIVE_INTAKE_REVIEW;
    const reason = "Sensitive category detected → human review (policy)";
    evidence.push(reason);
    events.push({
      action: `Routing forced to "${SENSITIVE_INTAKE_REVIEW}"`,
      reason,
    });
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
