import { describe, expect, it } from "vitest";
import { toRequesterView } from "@/lib/requesterView";
import type { FinalResult } from "@/lib/schemas";

const forcedReviewResult: FinalResult = {
  request_id: "req_test123",
  classification: "HR",
  priority: { level: "P2", rule_fired: "Business impact is high, or affected scope is multiple teams / company-wide → P2" },
  routing: {
    team: "Sensitive Intake Review",
    reason:
      "Forced by policy: sensitive category detected (HR/legal). Overrides model-suggested routing.",
  },
  response_draft:
    "Thanks for reaching out about your payroll shortfall — we're routing this to HR Operations.",
  decision_metadata: {
    confidence: {
      level: "high",
      reason: "All necessary information present; no ambiguity signals detected.",
    },
    business_impact: "high",
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
      hr_sensitive: true,
      legal_compliance_related: false,
      budget_commitment_requested: false,
      injection_indicators: false,
    },
    evidence: [
      "Sensitive category detected → human review (policy)",
      "Rule fired: Business impact is high, or affected scope is multiple teams / company-wide → P2 → P2",
      'Routing overridden: "HR Operations" → "Sensitive Intake Review" (guardrail policy)',
    ],
    timings_ms: { step1: 1000, step2: 1000, step3: 1000, total: 3000 },
    policy_version: "2026-08-11.v1",
    models_used: { step1: "claude-sonnet-4-6", step2: "claude-sonnet-4-6", step3: "claude-sonnet-4-6" },
  },
};

describe("toRequesterView", () => {
  it("suppresses every internal field for a forced-review case", () => {
    const view = toRequesterView(forcedReviewResult);
    const serialized = JSON.stringify(view);

    expect(serialized).not.toContain("Sensitive Intake Review");
    expect(serialized).not.toContain("P2");
    expect(serialized).not.toContain("hr_sensitive");
    expect(serialized).not.toContain("Rule fired");
    expect(serialized).not.toContain("Routing overridden");
    expect(serialized).not.toContain("confidence");
    expect(serialized).not.toContain("timings_ms");
    expect(serialized).not.toContain("evidence");
    expect(serialized).not.toContain("policy_version");

    // Explicit allow-list: only these keys are ever allowed to appear.
    expect(Object.keys(view).sort()).toEqual(["classification", "message", "status"].sort());
    expect(view.status).toBe("routed");
    expect(view.message).not.toContain("Sensitive Intake Review");
  });

  it("shows the response draft and clarifying questions verbatim when the gate did not proceed", () => {
    const clarifyResult: FinalResult = {
      ...forcedReviewResult,
      routing: null,
      clarifying_questions: ["What is your employee ID?", "When did this start?"],
      response_draft: "Could you share a couple more details so we can route this correctly?",
    };
    const view = toRequesterView(clarifyResult);
    expect(view.status).toBe("needs_more_info");
    expect(view.clarifying_questions).toEqual(clarifyResult.clarifying_questions);
    expect(view.message).toBe(clarifyResult.response_draft);
  });

  it("passes the response draft through verbatim for a normal, non-sensitive routed case", () => {
    const normalResult: FinalResult = {
      ...forcedReviewResult,
      routing: { team: "IT Helpdesk", reason: "Hardware issue." },
    };
    const view = toRequesterView(normalResult);
    expect(view.status).toBe("routed");
    expect(view.message).toBe(normalResult.response_draft);
  });
});
