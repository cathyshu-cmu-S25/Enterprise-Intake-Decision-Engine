import { describe, expect, it, vi, beforeEach } from "vitest";

const mockCallLLMWithValidation = vi.fn();

vi.mock("@/lib/llm/anthropic", () => ({
  callLLMWithValidation: (...args: unknown[]) => mockCallLLMWithValidation(...args),
  LLMValidationError: class LLMValidationError extends Error {},
}));

import { runPipeline } from "@/lib/pipeline";
import { SENSITIVE_INTAKE_REVIEW } from "@/lib/teams";

describe("runPipeline — guardrail forced routing always proceeds", () => {
  beforeEach(() => {
    mockCallLLMWithValidation.mockReset();
  });

  it("routes a sensitive request with 3 missing_information items straight to Sensitive Intake Review, not clarify mode", async () => {
    // Step 1: hr_sensitive with several missing details — on its own this
    // would trigger the "2+ missing items → low confidence, do not proceed"
    // clause and land in clarify mode.
    mockCallLLMWithValidation
      .mockResolvedValueOnce({
        data: {
          stated_ask: "My paycheck was short this month.",
          actual_need: "Correction of a payroll shortfall.",
          consequence_of_inaction: "Employee may not make rent.",
          signals: {
            deadline_detected: false,
            deadline_within_24h: false,
            deadline_description: null,
            security_incident: false,
            production_outage: false,
            revenue_impact: false,
            external_visibility: false,
            affected_scope: "individual",
            multiple_intents: false,
            hr_sensitive: true,
            legal_compliance_related: false,
            budget_commitment_requested: false,
            injection_indicators: false,
            affected_system: null,
            symptom_class: "request",
          },
          missing_information: [
            "Exact pay period affected",
            "Amount of the shortfall",
            "Employee ID / payroll record reference",
          ],
          reasoning: "Payroll shortfall report; HR-sensitive.",
        },
        modelUsed: "claude-sonnet-4-6",
        fallbackOccurred: false,
      })
      // Step 2: assessment
      .mockResolvedValueOnce({
        data: {
          business_impact: "medium",
          impact_reasoning: "Affects one employee's pay.",
          estimated_effort: "hours",
          effort_reasoning: "Payroll correction is usually quick once verified.",
        },
        modelUsed: "claude-sonnet-4-6",
        fallbackOccurred: false,
      })
      // Step 3: DECIDE — the model, unaware of the guardrail, suggests some
      // other team. The guardrail must override this post-hoc.
      .mockResolvedValueOnce({
        data: {
          classification: "Payroll Issue",
          routing: { team: "HR Operations", reason: "Payroll discrepancy." },
          response_draft: "Thanks for flagging this — we're looking into your payroll shortfall.",
        },
        modelUsed: "claude-sonnet-4-6",
        fallbackOccurred: false,
      });

    const result = await runPipeline("My paycheck was short this month.");

    expect(mockCallLLMWithValidation).toHaveBeenCalledTimes(3);
    expect(result.decision_metadata.confidence.level).toBe("low");
    expect(result.clarifying_questions).toBeUndefined();
    expect(result.routing).not.toBeNull();
    expect(result.routing?.team).toBe(SENSITIVE_INTAKE_REVIEW);
    expect(
      result.decision_metadata.evidence.some((e) =>
        e.includes("Sensitive category detected")
      )
    ).toBe(true);
    expect(
      result.decision_metadata.evidence.some((e) =>
        e.includes('Routing overridden: "HR Operations" → "Sensitive Intake Review"')
      )
    ).toBe(true);
    expect(result.decision_metadata.models_used).toEqual({
      step1: "claude-sonnet-4-6",
      step2: "claude-sonnet-4-6",
      step3: "claude-sonnet-4-6",
    });
  });
});
