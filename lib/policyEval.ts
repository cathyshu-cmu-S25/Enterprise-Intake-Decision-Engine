import type { Condition } from "@/config/policy";
import { Step1SignalsSchema, Step2AssessmentSchema } from "./schemas";
import type { Step1Signals, Step2Assessment } from "./schemas";

const VALID_SIGNAL_NAMES = new Set(Object.keys(Step1SignalsSchema.shape));
const VALID_ASSESSMENT_NAMES = new Set(Object.keys(Step2AssessmentSchema.shape));

/**
 * Recursively evaluates a policy condition against extracted signals and the
 * Step 2 assessment. No eval(), no dynamic code — a plain switch over the
 * condition variants defined in config/policy.ts.
 */
export function evaluateCondition(
  cond: Condition,
  signals: Step1Signals,
  assessment: Step2Assessment
): boolean {
  if ("all" in cond) return cond.all.every((c) => evaluateCondition(c, signals, assessment));
  if ("any" in cond) return cond.any.some((c) => evaluateCondition(c, signals, assessment));
  if ("not" in cond) return !evaluateCondition(cond.not, signals, assessment);
  if ("always" in cond) return true;
  if ("equals" in cond) {
    return (signals as unknown as Record<string, unknown>)[cond.signal] === cond.equals;
  }
  if ("assessment" in cond) {
    return cond.in.includes(String((assessment as unknown as Record<string, unknown>)[cond.assessment]));
  }
  if ("signal" in cond) {
    return cond.in.includes(String((signals as unknown as Record<string, unknown>)[cond.signal]));
  }
  throw new Error(`Unknown policy condition: ${JSON.stringify(cond)}`);
}

function collectReferencedNames(
  cond: Condition,
  signalNames: Set<string>,
  assessmentNames: Set<string>
): void {
  if ("all" in cond) {
    cond.all.forEach((c) => collectReferencedNames(c, signalNames, assessmentNames));
    return;
  }
  if ("any" in cond) {
    cond.any.forEach((c) => collectReferencedNames(c, signalNames, assessmentNames));
    return;
  }
  if ("not" in cond) {
    collectReferencedNames(cond.not, signalNames, assessmentNames);
    return;
  }
  if ("always" in cond) return;
  if ("assessment" in cond) {
    assessmentNames.add(cond.assessment);
    return;
  }
  if ("signal" in cond) {
    signalNames.add(cond.signal);
    return;
  }
}

/**
 * Validates that every signal/assessment field name referenced anywhere in
 * `rules` actually exists on the current Step 1 / Step 2 schemas. Intended
 * to run once at module load — an unknown name is a policy-authoring bug
 * and must fail loudly, not silently evaluate to false forever.
 */
export function validatePolicy(rules: { when: Condition }[]): void {
  const referencedSignals = new Set<string>();
  const referencedAssessments = new Set<string>();
  for (const rule of rules) {
    collectReferencedNames(rule.when, referencedSignals, referencedAssessments);
  }
  validateSignalNames([...referencedSignals]);
  for (const name of referencedAssessments) {
    if (!VALID_ASSESSMENT_NAMES.has(name)) {
      throw new Error(
        `Policy references unknown assessment field "${name}" — not present on the Step2Assessment schema.`
      );
    }
  }
}

/**
 * Validates a flat list of raw signal names (used by policy structures that
 * aren't condition trees, e.g. SENSITIVE_POLICY / GATE_POLICY's signal-name
 * arrays in config/policy.ts). Same fail-loudly-at-load-time contract.
 */
export function validateSignalNames(names: readonly string[]): void {
  for (const name of names) {
    if (!VALID_SIGNAL_NAMES.has(name)) {
      throw new Error(
        `Policy references unknown signal "${name}" — not present on the Step1Signals schema.`
      );
    }
  }
}
