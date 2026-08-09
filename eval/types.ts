import type { FinalResult } from "@/lib/schemas";
import type { GoldenCase } from "./golden-set";

export interface CheckResult {
  name: string;
  applicable: boolean; // false when the case doesn't assert this check
  pass: boolean; // true when not applicable, or when applicable and satisfied
  expected?: string;
  actual?: string;
}

export interface CaseResult {
  id: string;
  category: string;
  text: string;
  rationale: string;
  expect: GoldenCase["expect"];
  pass: boolean;
  checks: CheckResult[];
  aborted: boolean;
  abortReason?: string;
  result?: FinalResult;
  latencyMs?: number;
}
