import { z } from "zod";

// ---------------------------------------------------------------------------
// Step 1 — UNDERSTAND
// ---------------------------------------------------------------------------

export const Step1SignalsSchema = z.object({
  deadline_detected: z.boolean(),
  deadline_within_24h: z.boolean(),
  deadline_description: z.string().nullable(),
  security_incident: z.boolean(),
  production_outage: z.boolean(),
  revenue_impact: z.boolean(),
  external_visibility: z.boolean(),
  affected_scope: z.enum([
    "individual",
    "team",
    "multiple_teams",
    "company_wide",
  ]),
  multiple_intents: z.boolean(),
  hr_sensitive: z.boolean(),
  legal_compliance_related: z.boolean(),
  budget_commitment_requested: z.boolean(),
  injection_indicators: z.boolean(),
});
export type Step1Signals = z.infer<typeof Step1SignalsSchema>;

export const Step1OutputSchema = z.object({
  stated_ask: z.string(),
  actual_need: z.string(),
  consequence_of_inaction: z.string(),
  signals: Step1SignalsSchema,
  missing_information: z.array(z.string()),
  reasoning: z.string(),
});
export type Step1Output = z.infer<typeof Step1OutputSchema>;

// ---------------------------------------------------------------------------
// Step 2 — ASSESS
// ---------------------------------------------------------------------------

export const Step2AssessmentSchema = z.object({
  business_impact: z.enum(["low", "medium", "high", "critical"]),
  impact_reasoning: z.string(),
  estimated_effort: z.enum(["hours", "days", "weeks", "unknown"]),
  effort_reasoning: z.string(),
});
export type Step2Assessment = z.infer<typeof Step2AssessmentSchema>;

export const PriorityLevelSchema = z.enum(["P0", "P1", "P2", "P3"]);
export type PriorityLevel = z.infer<typeof PriorityLevelSchema>;

export const PriorityDecisionSchema = z.object({
  level: PriorityLevelSchema,
  rule_fired: z.string(),
});
export type PriorityDecision = z.infer<typeof PriorityDecisionSchema>;

export const ConfidenceLevelSchema = z.enum(["high", "medium", "low"]);
export type ConfidenceLevel = z.infer<typeof ConfidenceLevelSchema>;

export const GateDecisionSchema = z.object({
  confidence: ConfidenceLevelSchema,
  reason: z.string(),
  proceed: z.boolean(),
});
export type GateDecision = z.infer<typeof GateDecisionSchema>;

export const GuardrailResultSchema = z.object({
  forced_team: z.string().nullable(),
  block_spend_commitment: z.boolean(),
  confidence_cap: ConfidenceLevelSchema.nullable(),
  evidence: z.array(z.string()),
  events: z.array(
    z.object({
      action: z.string(),
      reason: z.string(),
    })
  ),
});
export type GuardrailResult = z.infer<typeof GuardrailResultSchema>;

// ---------------------------------------------------------------------------
// Step 3 — DECIDE
// ---------------------------------------------------------------------------

export const RoutingSchema = z.object({
  team: z.string(),
  reason: z.string(),
});
export type Routing = z.infer<typeof RoutingSchema>;

export const Step3ProceedOutputSchema = z.object({
  classification: z.string(),
  routing: RoutingSchema,
  response_draft: z.string(),
});
export type Step3ProceedOutput = z.infer<typeof Step3ProceedOutputSchema>;

export const Step3ClarifyOutputSchema = z.object({
  classification: z.string(),
  clarifying_questions: z.array(z.string()),
  response_draft: z.string(),
});
export type Step3ClarifyOutput = z.infer<typeof Step3ClarifyOutputSchema>;

// ---------------------------------------------------------------------------
// Final assembly
// ---------------------------------------------------------------------------

export const TimingsSchema = z.object({
  step1: z.number(),
  step2: z.number(),
  step3: z.number(),
  total: z.number(),
});
export type Timings = z.infer<typeof TimingsSchema>;

export const DecisionMetadataSchema = z.object({
  confidence: z.object({
    level: ConfidenceLevelSchema,
    reason: z.string(),
  }),
  business_impact: Step2AssessmentSchema.shape.business_impact,
  estimated_effort: Step2AssessmentSchema.shape.estimated_effort,
  signals: Step1SignalsSchema,
  evidence: z.array(z.string()),
  timings_ms: TimingsSchema,
  policy_version: z.string(),
});
export type DecisionMetadata = z.infer<typeof DecisionMetadataSchema>;

export const FinalResultSchema = z.object({
  request_id: z.string(),
  classification: z.string(),
  priority: PriorityDecisionSchema,
  routing: RoutingSchema.nullable(),
  response_draft: z.string(),
  clarifying_questions: z.array(z.string()).optional(),
  decision_metadata: DecisionMetadataSchema,
});
export type FinalResult = z.infer<typeof FinalResultSchema>;
