/**
 * In-process duplicate detection. Deliberately minimal: a Map, an exact
 * structured key, no external dependency. An unlabelled similarity
 * threshold (e.g. embeddings) is exactly the kind of uncalibrated parameter
 * that produced the 59% over-clarification rate this project already
 * measured once — this avoids that failure mode by construction.
 *
 * Merging is decided by code, never by the model: this module only counts
 * and annotates. It never suppresses, holds, or merges a request — not even
 * a corroborated one, and NOT EVEN a P0. A wrongly merged incident
 * disappears silently; a wrongly split one only wastes effort, so the bias
 * here is deliberately toward never merging.
 */

const DEDUP_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Only symptom classes describing a shared, externally-observable condition
 * participate. "access_denied" and "incorrect_data" are typically
 * account-specific, not a shared incident; "request" (e.g. two licence
 * requests) is never a duplicate report of a problem.
 */
const ELIGIBLE_SYMPTOM_CLASSES: ReadonlySet<string> = new Set(["unavailable", "degraded"]);

interface DedupEntry {
  requestId: string;
  timestamp: number;
}

export interface DedupRecordResult {
  corroboratingReports: number;
  relatedRequestIds: string[];
}

export class DedupStore {
  private entries = new Map<string, DedupEntry[]>();

  private key(affectedSystem: string, symptomClass: string): string {
    return `${affectedSystem}:${symptomClass}`;
  }

  /**
   * Records a new report and returns how many OTHER independent reports
   * already exist for the same affected_system + symptom_class within the
   * 30-minute window — an objective signal a single requester cannot
   * fabricate, since it counts distinct pipeline runs, not anything the
   * requester's own text claims.
   *
   * `now` is injectable for deterministic tests; defaults to the real clock.
   */
  record(
    affectedSystem: string | null,
    symptomClass: string,
    requestId: string,
    now: number = Date.now()
  ): DedupRecordResult {
    if (!affectedSystem || !ELIGIBLE_SYMPTOM_CLASSES.has(symptomClass)) {
      return { corroboratingReports: 0, relatedRequestIds: [] };
    }

    const k = this.key(affectedSystem, symptomClass);
    const withinWindow = (this.entries.get(k) ?? []).filter(
      (e) => now - e.timestamp <= DEDUP_WINDOW_MS
    );
    const relatedRequestIds = withinWindow.map((e) => e.requestId);

    withinWindow.push({ requestId, timestamp: now });
    this.entries.set(k, withinWindow);

    return { corroboratingReports: relatedRequestIds.length, relatedRequestIds };
  }

  /** Clears all recorded reports. Used between eval cases so unrelated
   * golden-set cases sharing a system name don't collide with each other. */
  reset(): void {
    this.entries.clear();
  }
}

/** Process-wide singleton — this is what makes it "in-process": state lives
 * only in this server's memory, reset on restart, never shared externally. */
export const dedupStore = new DedupStore();
