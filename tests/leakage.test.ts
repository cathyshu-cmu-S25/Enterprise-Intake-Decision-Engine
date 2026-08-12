import { describe, expect, it } from "vitest";
import { findDraftLeaks, findForcedReviewTeamNameLeak, findMarkdownResidue } from "@/eval/leakage";
import type { FinalResult } from "@/lib/schemas";

function baseResult(overrides: Partial<FinalResult> = {}): FinalResult {
  return {
    request_id: "req_test",
    classification: "IT Support",
    priority: { level: "P3", rule_fired: "No higher-priority rule matched → P3 (default)" },
    routing: { team: "IT Helpdesk", reason: "Hardware issue." },
    response_draft: "Thanks for reaching out — IT Helpdesk will follow up with you shortly.",
    decision_metadata: {
      confidence: { level: "high", reason: "test" },
      business_impact: "low",
      estimated_effort: "hours",
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
        hr_sensitive: false,
        legal_compliance_related: false,
        budget_commitment_requested: false,
        injection_indicators: false,
        affected_system: null,
        symptom_class: "request",
      },
      evidence: [],
      timings_ms: { step1: 100, step2: 100, step3: 100, total: 300 },
      policy_version: "test",
      models_used: { step1: "test-model", step2: "test-model", step3: "test-model" },
      corroborating_reports: 0,
    },
    ...overrides,
  };
}

describe("findDraftLeaks", () => {
  it("passes a clean draft", () => {
    expect(findDraftLeaks(baseResult())).toEqual([]);
  });

  it("flags a priority token", () => {
    const result = baseResult({ response_draft: "This has been classified as P0 and is urgent." });
    expect(findDraftLeaks(result).some((v) => v.includes("priority token"))).toBe(true);
  });

  it("flags internal confidence terminology", () => {
    const result = baseResult({ response_draft: "This was processed at medium confidence." });
    expect(findDraftLeaks(result).some((v) => v.includes("confidence token"))).toBe(true);
  });

  it("does not flag the ordinary English use of 'confidence'", () => {
    const result = baseResult({
      response_draft: "You can have confidence the fix will hold going forward.",
    });
    expect(findDraftLeaks(result).some((v) => v.includes("confidence token"))).toBe(false);
  });

  it("does not flag 'escalated' in ordinary customer-service phrasing", () => {
    const result = baseResult({
      response_draft: "This has been escalated to our Security team as an urgent matter.",
    });
    expect(findDraftLeaks(result)).toEqual([]);
  });

  it("flags the sensitive-review queue name", () => {
    const result = baseResult({ response_draft: "This was routed to Sensitive Intake Review." });
    expect(findDraftLeaks(result).some((v) => v.includes("Sensitive Intake Review"))).toBe(true);
  });

  it("flags a raw signal field name", () => {
    const result = baseResult({ response_draft: "Note: hr_sensitive was true for this request." });
    expect(findDraftLeaks(result).some((v) => v.includes("hr_sensitive"))).toBe(true);
  });

  it("flags forbidden process words", () => {
    const guardrailResult = baseResult({ response_draft: "A guardrail affected this routing." });
    expect(findDraftLeaks(guardrailResult).some((v) => v.includes('"guardrail"'))).toBe(true);

    const overriddenResult = baseResult({ response_draft: "The suggested team was overridden." });
    expect(findDraftLeaks(overriddenResult).some((v) => v.includes('"overridden"'))).toBe(true);
  });
});

describe("findMarkdownResidue", () => {
  it("passes plain text", () => {
    expect(findMarkdownResidue("Thanks for reaching out. We will follow up soon.")).toEqual([]);
  });

  it("flags **bold**", () => {
    expect(findMarkdownResidue("Please **do not** share your password.").length).toBeGreaterThan(0);
  });

  it("flags markdown headings", () => {
    expect(findMarkdownResidue("# Next steps\nWe will follow up.").length).toBeGreaterThan(0);
  });

  it("flags backtick code spans", () => {
    expect(findMarkdownResidue("Run `npm install` to fix it.").length).toBeGreaterThan(0);
  });
});

describe("findForcedReviewTeamNameLeak", () => {
  it("is empty for a normal (non-forced) routing", () => {
    expect(findForcedReviewTeamNameLeak(baseResult())).toEqual([]);
  });

  it("flags any team name when the case was actually forced to Sensitive Intake Review", () => {
    const result = baseResult({
      routing: { team: "Sensitive Intake Review", reason: "Forced by policy." },
      response_draft: "This was passed along to HR Operations for handling.",
    });
    expect(findForcedReviewTeamNameLeak(result).length).toBeGreaterThan(0);
  });

  it("passes a generic forced-review draft naming no team", () => {
    const result = baseResult({
      routing: { team: "Sensitive Intake Review", reason: "Forced by policy." },
      response_draft: "A person on our team will follow up with you directly.",
    });
    expect(findForcedReviewTeamNameLeak(result)).toEqual([]);
  });
});
