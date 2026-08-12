import { describe, expect, it, beforeEach } from "vitest";
import { DedupStore } from "@/lib/policy/dedup";

describe("DedupStore", () => {
  let store: DedupStore;

  beforeEach(() => {
    store = new DedupStore();
  });

  it("reports zero corroboration for the first report of a system+symptom", () => {
    const result = store.record("floor-3-wifi", "degraded", "req_1");
    expect(result.corroboratingReports).toBe(0);
    expect(result.relatedRequestIds).toEqual([]);
  });

  it("counts an exact match on affected_system + symptom_class within the window", () => {
    store.record("floor-3-wifi", "degraded", "req_1", 1_000_000);
    const second = store.record("floor-3-wifi", "degraded", "req_2", 1_000_000 + 60_000);
    expect(second.corroboratingReports).toBe(1);
    expect(second.relatedRequestIds).toEqual(["req_1"]);

    const third = store.record("floor-3-wifi", "degraded", "req_3", 1_000_000 + 120_000);
    expect(third.corroboratingReports).toBe(2);
    expect(third.relatedRequestIds).toEqual(["req_1", "req_2"]);
  });

  it("does not collide across different affected_system values", () => {
    store.record("floor-3-wifi", "degraded", "req_1");
    const result = store.record("floor-4-wifi", "degraded", "req_2");
    expect(result.corroboratingReports).toBe(0);
  });

  it("does not collide across different symptom_class values for the same system", () => {
    store.record("expense-portal", "unavailable", "req_1");
    const result = store.record("expense-portal", "access_denied", "req_2");
    expect(result.corroboratingReports).toBe(0);
  });

  it("never participates for symptom_class outside {unavailable, degraded}", () => {
    store.record("expense-portal", "access_denied", "req_1");
    store.record("expense-portal", "access_denied", "req_2");
    const third = store.record("expense-portal", "access_denied", "req_3");
    expect(third.corroboratingReports).toBe(0);

    store.record("design-tools", "request", "req_a");
    const licence2 = store.record("design-tools", "request", "req_b");
    expect(licence2.corroboratingReports).toBe(0); // two licence requests are not duplicates
  });

  it("never participates when affected_system is null", () => {
    store.record(null, "unavailable", "req_1");
    const result = store.record(null, "unavailable", "req_2");
    expect(result.corroboratingReports).toBe(0);
  });

  it("excludes reports older than the 30-minute window", () => {
    const t0 = 1_000_000;
    store.record("analytics-warehouse", "unavailable", "req_1", t0);
    const justUnder = store.record(
      "analytics-warehouse",
      "unavailable",
      "req_2",
      t0 + 29 * 60_000
    );
    expect(justUnder.corroboratingReports).toBe(1);

    const justOver = store.record(
      "analytics-warehouse",
      "unavailable",
      "req_3",
      t0 + 31 * 60_000
    );
    // req_1 has aged out; only req_2 (from 2 minutes ago, relative to req_3) remains.
    expect(justOver.corroboratingReports).toBe(1);
    expect(justOver.relatedRequestIds).toEqual(["req_2"]);
  });

  it("reset() clears all recorded reports", () => {
    store.record("floor-3-wifi", "degraded", "req_1");
    store.reset();
    const result = store.record("floor-3-wifi", "degraded", "req_2");
    expect(result.corroboratingReports).toBe(0);
  });
});
