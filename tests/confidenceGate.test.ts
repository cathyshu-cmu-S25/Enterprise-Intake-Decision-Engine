import { describe, expect, it } from "vitest";
import { computeConfidenceGate } from "@/lib/confidenceGate";

describe("computeConfidenceGate", () => {
  it("is low confidence and does not proceed with 2+ missing items and no P0", () => {
    const result = computeConfidenceGate({
      missing_information_count: 2,
      multiple_intents: false,
      is_p0: false,
      injection_cap: null,
    });
    expect(result.confidence).toBe("low");
    expect(result.proceed).toBe(false);
  });

  it("is low confidence and does not proceed when multiple_intents is true, even with no missing info", () => {
    const result = computeConfidenceGate({
      missing_information_count: 0,
      multiple_intents: true,
      is_p0: false,
      injection_cap: null,
    });
    expect(result.confidence).toBe("low");
    expect(result.proceed).toBe(false);
  });

  it("is medium confidence with exactly 1 missing item", () => {
    const result = computeConfidenceGate({
      missing_information_count: 1,
      multiple_intents: false,
      is_p0: false,
      injection_cap: null,
    });
    expect(result.confidence).toBe("medium");
    expect(result.proceed).toBe(true);
  });

  it("is medium confidence when injection cap applies, even with 0 missing items", () => {
    const result = computeConfidenceGate({
      missing_information_count: 0,
      multiple_intents: false,
      is_p0: false,
      injection_cap: "medium",
    });
    expect(result.confidence).toBe("medium");
    expect(result.proceed).toBe(true);
  });

  it("is high confidence with no missing items, no multiple intents, no injection cap", () => {
    const result = computeConfidenceGate({
      missing_information_count: 0,
      multiple_intents: false,
      is_p0: false,
      injection_cap: null,
    });
    expect(result.confidence).toBe("high");
    expect(result.proceed).toBe(true);
  });

  // --- P0 exception: a security/outage signal always proceeds -------------

  it("P0 exception: proceeds even with 2+ missing items, and keeps the label honest (still low)", () => {
    const result = computeConfidenceGate({
      missing_information_count: 3,
      multiple_intents: false,
      is_p0: true,
      injection_cap: null,
    });
    // missing_information_count >= 2 AND no P0 is false here (is_p0 is true),
    // so the label should NOT be forced to low by that clause alone.
    expect(result.confidence).toBe("high");
    expect(result.proceed).toBe(true);
  });

  it("P0 exception: proceeds even when multiple_intents is true, but label honestly reports low", () => {
    const result = computeConfidenceGate({
      missing_information_count: 0,
      multiple_intents: true,
      is_p0: true,
      injection_cap: null,
    });
    expect(result.confidence).toBe("low");
    expect(result.proceed).toBe(true);
    expect(result.reason).toMatch(/proceeding regardless/i);
  });

  it("P0 exception: never blocks proceed regardless of confidence label", () => {
    const result = computeConfidenceGate({
      missing_information_count: 5,
      multiple_intents: true,
      is_p0: true,
      injection_cap: "medium",
    });
    expect(result.proceed).toBe(true);
  });
});
