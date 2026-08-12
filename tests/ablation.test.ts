import { describe, expect, it, vi, beforeEach } from "vitest";

const mockCallLLMWithValidation = vi.fn();

vi.mock("@/lib/anthropic", () => ({
  callLLMWithValidation: (...args: unknown[]) => mockCallLLMWithValidation(...args),
  LLMValidationError: class LLMValidationError extends Error {},
}));

import { runPipeline } from "@/lib/pipeline";

describe("runPipeline — skipStep2ForAblation", () => {
  beforeEach(() => {
    mockCallLLMWithValidation.mockReset();
  });

  it("never calls the Step 2 LLM and substitutes a neutral business_impact that matches no priority rule", async () => {
    mockCallLLMWithValidation
      // Step 1 only — Step 2 must be skipped entirely, so only two mocked
      // calls are queued (Step 1, then Step 3).
      .mockResolvedValueOnce({
        data: {
          stated_ask: "The CRM has been slow all week.",
          actual_need: "Investigate CRM performance.",
          consequence_of_inaction: "Continued slow performance for the sales team.",
          signals: {
            deadline_detected: false,
            deadline_within_24h: false,
            deadline_description: null,
            security_incident: false,
            production_outage: false,
            revenue_impact: false,
            external_visibility: false,
            affected_scope: "team",
            multiple_intents: false,
            hr_sensitive: false,
            legal_compliance_related: false,
            budget_commitment_requested: false,
            injection_indicators: false,
            affected_system: "crm",
            symptom_class: "degraded",
          },
          missing_information: [],
          reasoning: "Straightforward performance complaint.",
        },
        modelUsed: "claude-sonnet-4-6",
        fallbackOccurred: false,
      })
      .mockResolvedValueOnce({
        data: {
          classification: "Business Applications",
          routing: { team: "Business Applications", reason: "CRM performance issue." },
          response_draft: "Thanks for reaching out — we're looking into the CRM slowness.",
        },
        modelUsed: "claude-sonnet-4-6",
        fallbackOccurred: false,
      });

    const result = await runPipeline("The CRM has been slow all week.", {
      skipStep2ForAblation: true,
    });

    // Exactly 2 LLM calls — Step 1 and Step 3. Step 2 never ran.
    expect(mockCallLLMWithValidation).toHaveBeenCalledTimes(2);

    expect(result.decision_metadata.business_impact).toBe("medium");
    expect(result.decision_metadata.estimated_effort).toBe("unknown");
    expect(result.decision_metadata.models_used.step2).toBe("n/a (skipped for ablation)");

    // affected_scope "team" alone (no deadline) does not match the
    // deadline-wide-scope rule, and business_impact "medium" matches neither
    // the "critical" nor "high" priority rules — so this should NOT inflate
    // to P1/P2 purely from the neutral placeholder.
    expect(result.priority.level).toBe("P3");
  });
});
