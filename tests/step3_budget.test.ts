import { describe, expect, it, vi, beforeEach } from "vitest";

const mockCallLLMWithValidation = vi.fn();

vi.mock("@/lib/anthropic", () => ({
  callLLMWithValidation: (...args: unknown[]) => mockCallLLMWithValidation(...args),
  LLMValidationError: class LLMValidationError extends Error {},
}));

import {
  runStep3Decide,
  containsSpendCommitment,
  containsAnyTeamName,
  buildProceedSystemPrompt,
} from "@/lib/pipeline/step3_decide";
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
    affected_system: null,
    symptom_class: "request",
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
        data: {
          classification: "Business Applications",
          routing: { team: "Business Applications", reason: "Procurement request" },
          response_draft: "We will cover the cost of the new server right away.",
        },
        modelUsed: "claude-sonnet-4-6",
        fallbackOccurred: false,
      })
      .mockResolvedValueOnce({
        data: {
          classification: "Business Applications",
          routing: { team: "Business Applications", reason: "Procurement request" },
          response_draft: "Thanks for the request — spend decisions require separate approval.",
        },
        modelUsed: "claude-sonnet-4-6",
        fallbackOccurred: false,
      });

    const result = await runStep3Decide({
      requestText: "Can we buy a new server for the team?",
      step1,
      assessment,
      priority,
      gate,
      blockSpendCommitment: true,
      forcedReview: false,
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
      data: {
        classification: "Business Applications",
        routing: { team: "Business Applications", reason: "Procurement request" },
        response_draft: "Thanks for the request — spend decisions require separate approval.",
      },
      modelUsed: "claude-sonnet-4-6",
      fallbackOccurred: false,
    });

    const result = await runStep3Decide({
      requestText: "Can we buy a new server for the team?",
      step1,
      assessment,
      priority,
      gate,
      blockSpendCommitment: true,
      forcedReview: false,
    });

    expect(mockCallLLMWithValidation).toHaveBeenCalledTimes(1);
    expect(result.mode).toBe("proceed");
  });

  it("does not run the post-check at all when blockSpendCommitment is false", async () => {
    mockCallLLMWithValidation.mockResolvedValueOnce({
      data: {
        classification: "Business Applications",
        routing: { team: "Business Applications", reason: "Procurement request" },
        response_draft: "We will cover the cost of the new server right away.",
      },
      modelUsed: "claude-sonnet-4-6",
      fallbackOccurred: false,
    });

    const result = await runStep3Decide({
      requestText: "Can we buy a new server for the team?",
      step1,
      assessment,
      priority,
      gate,
      blockSpendCommitment: false,
      forcedReview: false,
    });

    expect(mockCallLLMWithValidation).toHaveBeenCalledTimes(1);
    expect(result.mode).toBe("proceed");
    if (result.mode === "proceed") {
      // Regeneration is skipped, so the (uncommitted) draft passes through verbatim.
      expect(result.response_draft).toContain("We will cover the cost");
    }
  });

  it("reports fallbackOccurred=true if either the initial or regenerated call used the fallback model", async () => {
    mockCallLLMWithValidation
      .mockResolvedValueOnce({
        data: {
          classification: "Business Applications",
          routing: { team: "Business Applications", reason: "Procurement request" },
          response_draft: "We will cover the cost of the new server right away.",
        },
        modelUsed: "claude-haiku-4-5-20251001",
        fallbackOccurred: true,
      })
      .mockResolvedValueOnce({
        data: {
          classification: "Business Applications",
          routing: { team: "Business Applications", reason: "Procurement request" },
          response_draft: "Thanks for the request — spend decisions require separate approval.",
        },
        modelUsed: "claude-sonnet-4-6",
        fallbackOccurred: false,
      });

    const result = await runStep3Decide({
      requestText: "Can we buy a new server for the team?",
      step1,
      assessment,
      priority,
      gate,
      blockSpendCommitment: true,
      forcedReview: false,
    });

    expect(result.fallbackOccurred).toBe(true);
    // Reports the model that produced the draft actually used (the regenerated one).
    expect(result.modelUsed).toBe("claude-sonnet-4-6");
  });
});

describe("step3_decide — forced-review draft leak regeneration", () => {
  beforeEach(() => {
    mockCallLLMWithValidation.mockReset();
  });

  it("regenerates once when a forced-review draft names an internal team", async () => {
    mockCallLLMWithValidation
      .mockResolvedValueOnce({
        data: {
          classification: "HR",
          routing: { team: "HR Operations", reason: "Payroll discrepancy." },
          response_draft: "Thanks for reaching out — HR Operations will follow up with you shortly.",
        },
        modelUsed: "claude-sonnet-4-6",
        fallbackOccurred: false,
      })
      .mockResolvedValueOnce({
        data: {
          classification: "HR",
          routing: { team: "HR Operations", reason: "Payroll discrepancy." },
          response_draft: "Thanks for reaching out — a person on our team will follow up with you directly.",
        },
        modelUsed: "claude-sonnet-4-6",
        fallbackOccurred: false,
      });

    const result = await runStep3Decide({
      requestText: "My paycheck was short.",
      step1,
      assessment,
      priority,
      gate,
      blockSpendCommitment: false,
      forcedReview: true,
    });

    expect(mockCallLLMWithValidation).toHaveBeenCalledTimes(2);
    expect(result.mode).toBe("proceed");
    if (result.mode === "proceed") {
      expect(containsAnyTeamName(result.response_draft)).toBe(false);
      expect(result.response_draft).toContain("a person on our team");
    }
  });

  it("does not regenerate when the forced-review draft already names no team", async () => {
    mockCallLLMWithValidation.mockResolvedValueOnce({
      data: {
        classification: "HR",
        routing: { team: "HR Operations", reason: "Payroll discrepancy." },
        response_draft: "Thanks for reaching out — a person on our team will follow up with you directly.",
      },
      modelUsed: "claude-sonnet-4-6",
      fallbackOccurred: false,
    });

    const result = await runStep3Decide({
      requestText: "My paycheck was short.",
      step1,
      assessment,
      priority,
      gate,
      blockSpendCommitment: false,
      forcedReview: true,
    });

    expect(mockCallLLMWithValidation).toHaveBeenCalledTimes(1);
  });

  it("does not run the team-name post-check at all when forcedReview is false", async () => {
    mockCallLLMWithValidation.mockResolvedValueOnce({
      data: {
        classification: "IT Support",
        routing: { team: "IT Helpdesk", reason: "Hardware issue." },
        response_draft: "Thanks for reaching out — IT Helpdesk will follow up with you shortly.",
      },
      modelUsed: "claude-sonnet-4-6",
      fallbackOccurred: false,
    });

    const result = await runStep3Decide({
      requestText: "My monitor is flickering.",
      step1,
      assessment,
      priority,
      gate,
      blockSpendCommitment: false,
      forcedReview: false,
    });

    expect(mockCallLLMWithValidation).toHaveBeenCalledTimes(1);
    if (result.mode === "proceed") {
      expect(result.response_draft).toContain("IT Helpdesk");
    }
  });
});

describe("buildProceedSystemPrompt — clause selection", () => {
  it("includes neither clause when nothing applies", () => {
    const prompt = buildProceedSystemPrompt({ blockSpendCommitment: false, forcedReview: false });
    expect(prompt).not.toContain("sensitive-category policy");
    expect(prompt).not.toContain("commit spend");
  });

  it("includes only the sensitive clause when forcedReview is true", () => {
    const prompt = buildProceedSystemPrompt({ blockSpendCommitment: false, forcedReview: true });
    expect(prompt).toContain("sensitive-category policy");
    expect(prompt).not.toContain("MUST NOT commit to spending money");
  });

  it("includes only the spend clause when blockSpendCommitment is true", () => {
    const prompt = buildProceedSystemPrompt({ blockSpendCommitment: true, forcedReview: false });
    expect(prompt).toContain("MUST NOT commit to spending money");
    expect(prompt).not.toContain("sensitive-category policy");
  });

  it("includes both clauses when both apply", () => {
    const prompt = buildProceedSystemPrompt({ blockSpendCommitment: true, forcedReview: true });
    expect(prompt).toContain("sensitive-category policy");
    expect(prompt).toContain("MUST NOT commit to spending money");
  });

  it("always forbids markdown and internal-system language, regardless of clauses", () => {
    const prompt = buildProceedSystemPrompt({ blockSpendCommitment: false, forcedReview: false });
    expect(prompt).toContain("NO markdown formatting");
    expect(prompt).toContain("never write a priority level");
  });
});

describe("containsAnyTeamName", () => {
  it("detects a registry team name in text", () => {
    expect(containsAnyTeamName("IT Helpdesk will follow up shortly.")).toBe(true);
    expect(containsAnyTeamName("This has been sent to Security for review.")).toBe(true);
  });

  it("does not flag text naming no team", () => {
    expect(containsAnyTeamName("A person on our team will follow up with you directly.")).toBe(false);
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
