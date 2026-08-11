import { describe, expect, it } from "vitest";
import { applyGuardrails } from "@/lib/guardrails";
import { SENSITIVE_INTAKE_REVIEW } from "@/lib/teams";
import type { Step1Signals } from "@/lib/schemas";

function signals(overrides: Partial<Step1Signals> = {}): Step1Signals {
  return {
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
    ...overrides,
  };
}

describe("applyGuardrails — sensitive category forced routing", () => {
  it("forces Sensitive Intake Review when hr_sensitive is true", () => {
    const result = applyGuardrails(signals({ hr_sensitive: true }));
    expect(result.forced_team).toBe(SENSITIVE_INTAKE_REVIEW);
    expect(result.evidence).toContain(
      "Sensitive category detected → human review (policy)"
    );
  });

  it("forces Sensitive Intake Review when legal_compliance_related is true", () => {
    const result = applyGuardrails(signals({ legal_compliance_related: true }));
    expect(result.forced_team).toBe(SENSITIVE_INTAKE_REVIEW);
  });

  it("forces Sensitive Intake Review when both hr_sensitive and legal_compliance_related are true", () => {
    const result = applyGuardrails(
      signals({ hr_sensitive: true, legal_compliance_related: true })
    );
    expect(result.forced_team).toBe(SENSITIVE_INTAKE_REVIEW);
    // Only one evidence entry for the sensitive-category guardrail, not duplicated.
    expect(
      result.evidence.filter((e) => e.includes("Sensitive category detected"))
    ).toHaveLength(1);
  });

  it("does not force routing when neither hr_sensitive nor legal_compliance_related is set", () => {
    const result = applyGuardrails(signals());
    expect(result.forced_team).toBeNull();
  });
});

describe("applyGuardrails — incident response precedence", () => {
  it("does not force routing when legal_compliance_related co-occurs with an active security incident, and records the precedence note", () => {
    const result = applyGuardrails(
      signals({ legal_compliance_related: true, security_incident: true })
    );
    expect(result.forced_team).toBeNull();
    expect(
      result.evidence.some((e) =>
        e.includes("incident response precedes compliance review")
      )
    ).toBe(true);
  });

  it("does not force routing when legal_compliance_related co-occurs with a production outage", () => {
    const result = applyGuardrails(
      signals({ legal_compliance_related: true, production_outage: true })
    );
    expect(result.forced_team).toBeNull();
  });

  it("still forces routing on legal_compliance_related when no incident is in progress", () => {
    const result = applyGuardrails(signals({ legal_compliance_related: true }));
    expect(result.forced_team).toBe(SENSITIVE_INTAKE_REVIEW);
  });

  it("still forces routing on hr_sensitive even when a security incident is in progress — HR is never exempt", () => {
    const result = applyGuardrails(
      signals({ hr_sensitive: true, security_incident: true })
    );
    expect(result.forced_team).toBe(SENSITIVE_INTAKE_REVIEW);
  });
});

describe("applyGuardrails — injection confidence cap", () => {
  it("caps confidence at medium when injection_indicators is true", () => {
    const result = applyGuardrails(signals({ injection_indicators: true }));
    expect(result.confidence_cap).toBe("medium");
    expect(result.evidence).toContain(
      "Instruction-like content detected in request; treated as data, not commands"
    );
  });

  it("does not cap confidence when injection_indicators is false", () => {
    const result = applyGuardrails(signals());
    expect(result.confidence_cap).toBeNull();
  });
});

describe("applyGuardrails — budget commitment flag", () => {
  it("flags block_spend_commitment when budget_commitment_requested is true", () => {
    const result = applyGuardrails(signals({ budget_commitment_requested: true }));
    expect(result.block_spend_commitment).toBe(true);
  });
});
