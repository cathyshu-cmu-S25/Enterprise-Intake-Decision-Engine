import { runStep1Understand } from "./step1_understand";
import { runStep2Assess } from "./step2_assess";
import { runStep3Decide } from "./step3_decide";
import { computePriority } from "../priorityRules";
import { applyGuardrails } from "../guardrails";
import { computeConfidenceGate } from "../confidenceGate";
import { LLMValidationError } from "../anthropic";
import type {
  FinalResult,
  Step1Output,
  Step2Assessment,
  PriorityDecision,
  GateDecision,
} from "../schemas";

export type PipelineEvent =
  | { type: "step_start"; step: 1 | 2 | 3; name: string }
  | { type: "step_output"; step: 1 | 2 | 3; data: unknown }
  | { type: "rule_decision"; data: PriorityDecision }
  | { type: "gate_decision"; data: GateDecision }
  | { type: "guardrail"; data: { action: string; reason: string } }
  | { type: "final"; data: FinalResult }
  | { type: "error"; message: string };

export interface RunPipelineOptions {
  onEvent?: (event: PipelineEvent) => void;
}

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
  try {
    emit({ type: "step_start", step: 1, name: "Understand" });
    const t0 = Date.now();
    step1 = await runStep1Understand(requestText);
    step1Ms = Date.now() - t0;
    emit({ type: "step_output", step: 1, data: step1 });
  } catch (err) {
    fail(err, emit);
  }

  let assessment: Step2Assessment;
  let step2Ms: number;
  try {
    emit({ type: "step_start", step: 2, name: "Assess" });
    const t0 = Date.now();
    assessment = await runStep2Assess(requestText, step1);
    step2Ms = Date.now() - t0;
    emit({ type: "step_output", step: 2, data: assessment });
  } catch (err) {
    fail(err, emit);
  }

  // (b) deterministic priority — never set by the LLM.
  const priority = computePriority(step1.signals, assessment);
  emit({ type: "rule_decision", data: priority });

  // (c) deterministic guardrails over signals.
  const guardrails = applyGuardrails(step1.signals);
  for (const event of guardrails.events) {
    emit({ type: "guardrail", data: event });
  }

  // (d) deterministic confidence gate.
  const gate = computeConfidenceGate({
    missing_information_count: step1.missing_information.length,
    multiple_intents: step1.signals.multiple_intents,
    is_p0: priority.level === "P0",
    injection_cap: guardrails.confidence_cap,
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
    });
    step3Ms = Date.now() - t0;
    emit({ type: "step_output", step: 3, data: step3 });
  } catch (err) {
    fail(err, emit);
  }

  // Final assembly. Guardrail routing overrides are applied here, post-Step 3,
  // so the override is visible in the evidence trail.
  const evidence = [
    ...buildBaseEvidence(step1, assessment, priority),
    ...guardrails.evidence,
  ];

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
    classification: step3.classification,
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
    },
  };

  emit({ type: "final", data: final });
  return final;
}
