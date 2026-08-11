import type { FinalResult } from "@/lib/schemas";
import { Step1SignalsSchema } from "@/lib/schemas";
import { PRIORITY_POLICY } from "@/config/policy";
import { SENSITIVE_INTAKE_REVIEW, TEAMS } from "@/lib/teams";

// Derived from the schema, not hardcoded — if a signal is renamed or added,
// this list follows automatically.
const SIGNAL_NAMES = Object.keys(Step1SignalsSchema.shape);
const RULE_IDS = PRIORITY_POLICY.map((r) => r.id);
const FORBIDDEN_WORDS = ["guardrail", "override", "overridden", "escalated"];
const PRIORITY_TOKEN_RE = /\bp[0-3]\b/i;
const CONFIDENCE_TOKEN_RE = /\bconfidence\b/i;

// response_draft is plain text delivered as an email/ticket comment — the
// UI does not render markdown, so any of these are literal asterisks/hashes
// showing up in what the requester reads.
const MARKDOWN_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "**bold**", re: /\*\*[^*\n]+\*\*/ },
  { label: "__bold__", re: /__[^_\n]+__/ },
  { label: "markdown heading (#)", re: /^#{1,6}\s+\S/m },
  { label: "backtick code", re: /`[^`\n]+`/ },
];

export function findMarkdownResidue(text: string): string[] {
  return MARKDOWN_PATTERNS.filter(({ re }) => re.test(text)).map(
    ({ label }) => `markdown syntax: ${label}`
  );
}

/**
 * `response_draft` is the entire outbound artifact — the requester never
 * opens this app, the only thing they receive is this text, as an email or
 * ticket comment. This checks the text itself for anything that should
 * never leave the system: priority/confidence labels, the sensitive-review
 * queue name, raw signal/rule identifiers, or guardrail-process language.
 */
export function findDraftLeaks(result: FinalResult): string[] {
  const draft = result.response_draft;
  const lower = draft.toLowerCase();
  const violations: string[] = [];

  if (PRIORITY_TOKEN_RE.test(draft)) violations.push("priority token (P0-P3)");
  if (CONFIDENCE_TOKEN_RE.test(draft)) violations.push("confidence token");
  if (lower.includes(SENSITIVE_INTAKE_REVIEW.toLowerCase())) {
    violations.push(`"${SENSITIVE_INTAKE_REVIEW}"`);
  }

  for (const name of SIGNAL_NAMES) {
    if (lower.includes(name.toLowerCase())) violations.push(`signal field name "${name}"`);
  }
  for (const id of RULE_IDS) {
    if (lower.includes(id.toLowerCase())) violations.push(`priority rule id "${id}"`);
  }
  if (result.priority.rule_fired && lower.includes(result.priority.rule_fired.toLowerCase())) {
    violations.push("literal rule_fired text");
  }
  for (const word of FORBIDDEN_WORDS) {
    if (new RegExp(`\\b${word}\\b`, "i").test(draft)) {
      violations.push(`forbidden word "${word}"`);
    }
  }

  violations.push(...findMarkdownResidue(draft));

  return violations;
}

/**
 * Forced-review cases (hr_sensitive / legal_compliance_related) must not
 * name ANY internal team in the draft — not even the correct final one —
 * because Step 3 wrote the draft before the guardrail override happened, or
 * because the sensitive prompt variant is supposed to stay generic
 * regardless. Only applicable when the case actually ended up forced.
 */
export function findForcedReviewTeamNameLeak(result: FinalResult): string[] {
  if (result.routing?.team !== SENSITIVE_INTAKE_REVIEW) return [];
  const lower = result.response_draft.toLowerCase();
  return TEAMS.filter((t) => lower.includes(t.name.toLowerCase())).map(
    (t) => `internal team name "${t.name}"`
  );
}
