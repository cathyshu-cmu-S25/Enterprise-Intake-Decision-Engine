import { describe, expect, it } from "vitest";
import { computePriority } from "@/lib/priorityRules";
import type { Step1Signals, Step2Assessment } from "@/lib/schemas";

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
    ...overrides,
  };
}

function assessment(overrides: Partial<Step2Assessment> = {}): Step2Assessment {
  return {
    business_impact: "low",
    impact_reasoning: "test",
    estimated_effort: "hours",
    effort_reasoning: "test",
    ...overrides,
  };
}

describe("computePriority", () => {
  it("security_incident fires P0", () => {
    const result = computePriority(signals({ security_incident: true }), assessment());
    expect(result.level).toBe("P0");
    expect(result.rule_fired).toMatch(/Security\/outage policy|Security incident/);
  });

  it("production_outage fires P0", () => {
    const result = computePriority(signals({ production_outage: true }), assessment());
    expect(result.level).toBe("P0");
  });

  it("security_incident takes priority over everything else (P0 beats P1/P2 conditions)", () => {
    const result = computePriority(
      signals({
        security_incident: true,
        deadline_within_24h: true,
        external_visibility: true,
      }),
      assessment({ business_impact: "critical" })
    );
    expect(result.level).toBe("P0");
  });

  it("deadline within 24h + external visibility fires P1", () => {
    const result = computePriority(
      signals({ deadline_within_24h: true, external_visibility: true }),
      assessment()
    );
    expect(result.level).toBe("P1");
  });

  it("deadline within 24h + revenue impact fires P1", () => {
    const result = computePriority(
      signals({ deadline_within_24h: true, revenue_impact: true }),
      assessment()
    );
    expect(result.level).toBe("P1");
  });

  it("critical business impact fires P1", () => {
    const result = computePriority(signals(), assessment({ business_impact: "critical" }));
    expect(result.level).toBe("P1");
  });

  it("deadline detected + company-wide scope fires P1", () => {
    const result = computePriority(
      signals({ deadline_detected: true, affected_scope: "company_wide" }),
      assessment()
    );
    expect(result.level).toBe("P1");
  });

  it("deadline detected + multiple_teams scope fires P1", () => {
    const result = computePriority(
      signals({ deadline_detected: true, affected_scope: "multiple_teams" }),
      assessment()
    );
    expect(result.level).toBe("P1");
  });

  it("high business impact (no other signals) fires P2", () => {
    const result = computePriority(signals(), assessment({ business_impact: "high" }));
    expect(result.level).toBe("P2");
  });

  it("multiple_teams scope alone (no deadline) fires P2", () => {
    const result = computePriority(
      signals({ affected_scope: "multiple_teams" }),
      assessment()
    );
    expect(result.level).toBe("P2");
  });

  it("no matching signals falls through to default P3", () => {
    const result = computePriority(signals(), assessment());
    expect(result.level).toBe("P3");
  });

  it("urgency claims co-occurring with injection_indicators do not raise priority", () => {
    // Simulates the prompt-injection preset: the LLM has correctly extracted
    // injection_indicators=true, but none of the *real* underlying signals
    // (security_incident, deadline, revenue, scope) are true, because the
    // "mark this P0" instruction inside the request was not followed.
    const result = computePriority(
      signals({ injection_indicators: true }),
      assessment({ business_impact: "low" })
    );
    expect(result.level).toBe("P3");
    expect(result.rule_fired).not.toMatch(/P0/);
  });
});
