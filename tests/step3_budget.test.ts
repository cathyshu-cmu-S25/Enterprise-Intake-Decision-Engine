import { describe, expect, it, vi, beforeEach } from "vitest";

const mockCallLLMWithValidation = vi.fn();

vi.mock("@/lib/anthropic", () => ({
  callLLMWithValidation: (...args: unknown[]) => mockCallLLMWithValidation(...args),
  LLMValidationError: class LLMValidationError extends Error {},
}));

import { runStep3Decide, containsSpendCommitment } from "@/lib/pipeline/step3_decide";
import type { Step1Output, Step2Assessment, PriorityDecision, GateDecision } from "@/lib/schemas";

const step1: Step1Output = {
  stated_ask: "Can we buy a new server for the team?",
  actual_need: "Additional compute capacity for the reporting job.",
  consequence_of_inaction: "Reports keep timing out.",
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
    budget_commitment_requested: true,
    injection_indicators: false,
  },
  missing_information: [],
  reasoning: "Straightforward purchase request.",
};

const assessment: Step2Assessment = {
  business_impact: "medium",
  impact_reasoning: "Affects one team's reporting.",
  estimated_effort: "days",
  effort_reasoning: "Procurement takes a few days.",
};

const priority: PriorityDecision = { level: "P2", rule_fired: "test" };
const gate: GateDecision = { confidence: "high", reason: "test", proceed: true };

describe("step3_decide — budget post-check regeneration", () => {
  beforeEach(() => {
    mockCallLLMWithValidation.mockReset();
  });

  it("regenerates once when the first draft contains spend-commitment language", async () => {
    mockCallLLMWithValidation
      .mockResolvedValueOnce({
        classification: "Business Applications",
        routing: { team: "Business Applications", reason: "Procurement request" },
        response_draft: "We will cover the cost of the new server right away.",
      })
      .mockResolvedValueOnce({
        classification: "Business Applications",
        routing: { team: "Business Applications", reason: "Procurement request" },
        response_draft: "Thanks for the request — spend decisions require separate approval.",
      });

    const result = await runStep3Decide({
      requestText: "Can we buy a new server for the team?",
      step1,
      assessment,
      priority,
      gate,
      blockSpendCommitment: true,
    });

    expect(mockCallLLMWithValidation).toHaveBeenCalledTimes(2);
    expect(result.mode).toBe("proceed");
    if (result.mode === "proceed") {
      expect(containsSpendCommitment(result.response_draft)).toBe(false);
      expect(result.response_draft).toContain("require separate approval");
    }
  });

  it("does not regenerate when the first draft already avoids spend commitment", async () => {
    mockCallLLMWithValidation.mockResolvedValueOnce({
      classification: "Business Applications",
      routing: { team: "Business Applications", reason: "Procurement request" },
      response_draft: "Thanks for the request — spend decisions require separate approval.",
    });

    const result = await runStep3Decide({
      requestText: "Can we buy a new server for the team?",
      step1,
      assessment,
      priority,
      gate,
      blockSpendCommitment: true,
    });

    expect(mockCallLLMWithValidation).toHaveBeenCalledTimes(1);
    expect(result.mode).toBe("proceed");
  });

  it("does not run the post-check at all when blockSpendCommitment is false", async () => {
    mockCallLLMWithValidation.mockResolvedValueOnce({
      classification: "Business Applications",
      routing: { team: "Business Applications", reason: "Procurement request" },
      response_draft: "We will cover the cost of the new server right away.",
    });

    const result = await runStep3Decide({
      requestText: "Can we buy a new server for the team?",
      step1,
      assessment,
      priority,
      gate,
      blockSpendCommitment: false,
    });

    expect(mockCallLLMWithValidation).toHaveBeenCalledTimes(1);
    expect(result.mode).toBe("proceed");
    if (result.mode === "proceed") {
      // Regeneration is skipped, so the (uncommitted) draft passes through verbatim.
      expect(result.response_draft).toContain("We will cover the cost");
    }
  });
});

describe("containsSpendCommitment", () => {
  it("detects common spend-commitment phrasing", () => {
    expect(containsSpendCommitment("We will cover the cost of the license.")).toBe(true);
    expect(containsSpendCommitment("Your purchase is approved.")).toBe(true);
    expect(containsSpendCommitment("Go ahead and buy the replacement part.")).toBe(true);
  });

  it("does not flag neutral acknowledgements", () => {
    expect(
      containsSpendCommitment(
        "Thanks for the request — this needs separate budget approval before we can proceed."
      )
    ).toBe(false);
  });
});
