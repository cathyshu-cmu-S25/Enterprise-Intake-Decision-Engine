import { runStep1Understand } from "./step1_understand";
import { runStep2Assess } from "./step2_assess";
import { runStep3Decide } from "./step3_decide";
import { computePriority } from "../policy/priorityRules";
import { applyGuardrails } from "../policy/guardrails";
import { computeConfidenceGate } from "../policy/confidenceGate";
import { LLMValidationError } from "../llm/anthropic";
import { dedupStore } from "../policy/dedup";
import { POLICY_VERSION } from "@/config/policy";
import type {
  FinalResult,
  Step1Output,
  Step2Assessment,
  PriorityDecision,
  GateDecision,
  ConfidenceLevel,
} from "../schemas";

export type PipelineEvent =
  | { type: "step_start"; step: 1 | 2 | 3; name: string }
  | { type: "step_output"; step: 1 | 2 | 3; data: unknown }
  | { type: "rule_decision"; data: PriorityDecision }
  | { type: "gate_decision"; data: GateDecision }
  | { type: "guardrail"; data: { action: string; reason: string } }
  | { type: "model_fallback"; data: { step: 1 | 2 | 3; model: string } }
  | { type: "final"; data: FinalResult }
  | { type: "error"; message: string };

export interface RunPipelineOptions {
  onEvent?: (event: PipelineEvent) => void;
  /**
   * Ablation testing only — never used by the live app or a normal eval run.
   * Skips the Step 2 LLM call entirely and substitutes a neutral
   * business_impact ("medium") that doesn't match either priority rule that
   * reads it, to measure how much Step 2 actually changes outcomes.
   */
  skipStep2ForAblation?: boolean;
}

const ABLATION_NEUTRAL_ASSESSMENT: Step2Assessment = {
  business_impact: "medium",
  impact_reasoning: "(ablation: Step 2 skipped, neutral value substituted)",
  estimated_effort: "unknown",
  effort_reasoning: "(ablation: Step 2 skipped, neutral value substituted)",
};

/** Thrown when a pipeline step aborts after failing validation twice. The
 * "error" event has already been emitted before this is thrown. */
export class PipelineAbortedError extends Error {}

function buildBaseEvidence(
  step1: Step1Output,
  assessment: Step2Assessment,
  priority: PriorityDecision
): string[] {
  const evidence: string[] = [];
  if (step1.signals.deadline_detected) {
    evidence.push(
      `Deadline detected: ${step1.signals.deadline_description ?? "unspecified"}${
        step1.signals.deadline_within_24h ? " (within 24h)" : ""
      }`
    );
  }
  if (step1.signals.security_incident) evidence.push("Security incident signal detected");
  if (step1.signals.production_outage) evidence.push("Production outage signal detected");
  if (step1.signals.injection_indicators) {
    evidence.push(
      "Injection attempt detected in request text; instructions ignored, treated as data only"
    );
  }
  evidence.push(`Rule fired: ${priority.rule_fired} → ${priority.level}`);
  evidence.push(
    `Business impact assessed as ${assessment.business_impact}; estimated effort ${assessment.estimated_effort}`
  );
  return evidence;
}

function fail(err: unknown, emit: (e: PipelineEvent) => void): never {
  const message =
    err instanceof LLMValidationError
      ? "Escalated to human review: output failed validation"
      : err instanceof Error
        ? err.message
        : String(err);
  emit({ type: "error", message });
  throw new PipelineAbortedError(message);
}

/**
 * Runs the full three-step triage pipeline. Importable and runnable outside
 * Next.js (e.g. by an eval script) — `onEvent` is optional; omit it to just
 * await the final result.
 */
export async function runPipeline(
  requestText: string,
  options: RunPipelineOptions = {}
): Promise<FinalResult> {
  const emit = options.onEvent ?? (() => {});
  const requestId = `req_${crypto.randomUUID().slice(0, 8)}`;
  const pipelineStart = Date.now();

  let step1: Step1Output;
  let step1Ms: number;
  let step1Model: string;
  let step1Fallback: boolean;
  try {
    emit({ type: "step_start", step: 1, name: "Understand" });
    const t0 = Date.now();
    const call = await runStep1Understand(requestText);
    step1Ms = Date.now() - t0;
    step1 = call.data;
    step1Model = call.modelUsed;
    step1Fallback = call.fallbackOccurred;
    emit({ type: "step_output", step: 1, data: step1 });
    if (step1Fallback) emit({ type: "model_fallback", data: { step: 1, model: step1Model } });
  } catch (err) {
    fail(err, emit);
  }

  // Duplicate detection: exact-match on affected_system + symptom_class,
  // decided entirely by code. Report-only — never wired into priority, and
  // never merges or suppresses anything, including P0. A single requester
  // cannot fabricate this signal; it counts independent pipeline runs.
  const dedup = dedupStore.record(step1.signals.affected_system, step1.signals.symptom_class, requestId);

  let assessment: Step2Assessment;
  let step2Ms: number;
  let step2Model: string;
  let step2Fallback: boolean;
  if (options.skipStep2ForAblation) {
    emit({ type: "step_start", step: 2, name: "Assess (SKIPPED — ablation)" });
    assessment = ABLATION_NEUTRAL_ASSESSMENT;
    step2Ms = 0;
    step2Model = "n/a (skipped for ablation)";
    step2Fallback = false;
    emit({ type: "step_output", step: 2, data: assessment });
  } else {
    try {
      emit({ type: "step_start", step: 2, name: "Assess" });
      const t0 = Date.now();
      const call = await runStep2Assess(requestText, step1);
      step2Ms = Date.now() - t0;
      assessment = call.data;
      step2Model = call.modelUsed;
      step2Fallback = call.fallbackOccurred;
      emit({ type: "step_output", step: 2, data: assessment });
      if (step2Fallback) emit({ type: "model_fallback", data: { step: 2, model: step2Model } });
    } catch (err) {
      fail(err, emit);
    }
  }

  // (b) deterministic priority — never set by the LLM.
  const priority = computePriority(step1.signals, assessment);
  emit({ type: "rule_decision", data: priority });

  // (c) deterministic guardrails over signals.
  const guardrails = applyGuardrails(step1.signals);
  for (const event of guardrails.events) {
    emit({ type: "guardrail", data: event });
  }

  // A fallback model changes signal quality, not decision logic — the rule
  // table, guardrails, and gate are untouched, and identical signals still
  // produce an identical priority. But a degraded sensor should make the
  // system less certain of itself. Reuse the existing confidence_cap
  // mechanism (the same one prompt injection uses) rather than inventing a
  // parallel one; combine before the gate call, so confidenceGate.ts itself
  // stays untouched.
  //
  // Note the ordering constraint: the gate runs BEFORE Step 3 (its proceed
  // decision shapes how Step 3 runs), so only a Step 1/2 fallback can
  // actually influence gate.confidence here. A Step-3-only fallback is still
  // recorded in evidence and models_used below, just without claiming to
  // have capped a confidence value that was already computed.
  const preStep3FallbackOccurred = step1Fallback || step2Fallback;
  const preStep3Cap: ConfidenceLevel | null =
    guardrails.confidence_cap !== null || preStep3FallbackOccurred ? "medium" : null;

  // (d) deterministic confidence gate.
  const gate = computeConfidenceGate({
    missing_information_count: step1.missing_information.length,
    multiple_intents: step1.signals.multiple_intents,
    is_p0: priority.level === "P0",
    injection_cap: preStep3Cap,
    forced_review: guardrails.forced_team !== null,
  });
  emit({ type: "gate_decision", data: gate });

  let step3;
  let step3Ms: number;
  try {
    emit({ type: "step_start", step: 3, name: "Decide" });
    const t0 = Date.now();
    step3 = await runStep3Decide({
      requestText,
      step1,
      assessment,
      priority,
      gate,
      blockSpendCommitment: guardrails.block_spend_commitment,
      forcedReview: guardrails.forced_team !== null,
    });
    step3Ms = Date.now() - t0;
    emit({ type: "step_output", step: 3, data: step3 });
    if (step3.fallbackOccurred) {
      emit({ type: "model_fallback", data: { step: 3, model: step3.modelUsed } });
    }
  } catch (err) {
    fail(err, emit);
  }

  // Final assembly. Guardrail routing overrides are applied here, post-Step 3,
  // so the override is visible in the evidence trail.
  const evidence = [
    ...buildBaseEvidence(step1, assessment, priority),
    ...guardrails.evidence,
  ];

  if (dedup.corroboratingReports > 0) {
    // Annotate only — never merges or suppresses, including for P0. A
    // wrongly merged incident disappears silently; a wrongly split one only
    // wastes effort, so the system always continues normally either way.
    evidence.push(
      `Corroborating reports: ${dedup.corroboratingReports} other independent report(s) of the ` +
        `same system + symptom in the last 30 minutes (possibly related to ` +
        `${dedup.relatedRequestIds.join(", ")}).`
    );
  }

  const modelFallbackOccurred = step1Fallback || step2Fallback || step3.fallbackOccurred;
  if (modelFallbackOccurred) {
    const fallbackSteps = [
      step1Fallback ? `step1 (${step1Model})` : null,
      step2Fallback ? `step2 (${step2Model})` : null,
      step3.fallbackOccurred ? `step3 (${step3.modelUsed})` : null,
    ].filter((s): s is string => s !== null);
    evidence.push(
      `Fallback model used for ${fallbackSteps.join(", ")} (primary unavailable)` +
        (preStep3FallbackOccurred ? "; confidence capped accordingly." : ".")
    );
  }

  let routing: { team: string; reason: string } | null = null;
  let clarifying_questions: string[] | undefined;

  if (step3.mode === "proceed") {
    routing = step3.routing;
    if (guardrails.forced_team && guardrails.forced_team !== routing.team) {
      evidence.push(
        `Routing overridden: "${routing.team}" → "${guardrails.forced_team}" (guardrail policy)`
      );
      routing = {
        team: guardrails.forced_team,
        reason:
          "Forced by policy: sensitive category detected (HR/legal). Overrides model-suggested routing.",
      };
    }
  } else {
    clarifying_questions = step3.clarifying_questions;
  }

  const totalMs = Date.now() - pipelineStart;

  const final: FinalResult = {
    request_id: requestId,
    // Only proceed mode actually classified the request; clarify mode means
    // there wasn't enough information to do that yet.
    ...(step3.mode === "proceed" ? { classification: step3.classification } : {}),
    priority,
    routing,
    response_draft: step3.response_draft,
    ...(clarifying_questions ? { clarifying_questions } : {}),
    decision_metadata: {
      confidence: { level: gate.confidence, reason: gate.reason },
      business_impact: assessment.business_impact,
      estimated_effort: assessment.estimated_effort,
      signals: step1.signals,
      evidence,
      timings_ms: {
        step1: step1Ms,
        step2: step2Ms,
        step3: step3Ms,
        total: totalMs,
      },
      policy_version: POLICY_VERSION,
      models_used: {
        step1: step1Model,
        step2: step2Model,
        step3: step3.modelUsed,
      },
      corroborating_reports: dedup.corroboratingReports,
    },
  };

  emit({ type: "final", data: final });
  return final;
}
