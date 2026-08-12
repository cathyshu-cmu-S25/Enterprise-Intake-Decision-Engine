import type { FinalResult } from "./schemas";

/**
 * What a requester is allowed to see. This is an explicit allow-list, not a
 * subtraction from FinalResult — nothing reaches this shape unless it's
 * named here. No signals, no rule_fired, no guardrail evidence, no
 * confidence label, no timings, no priority level.
 *
 * `message` is always `response_draft`, verbatim — response_draft IS the
 * entire outbound artifact (the requester never opens this app; this text
 * is delivered as an email or ticket comment), so there is nothing to
 * project here beyond what Step 3 already produced. response_draft's
 * safety (no internal team names, no priority/confidence tokens, no
 * markdown) is enforced at generation time — see lib/pipeline/step3_decide.ts's
 * sensitive-clause prompt variant and eval/leakage.ts's checks — not by
 * substituting a different string here. A view-layer override that diverges
 * from the real outbound text would defeat the point: what you demo here
 * must be what actually gets sent.
 */
export interface RequesterView {
  // Only present when status is "routed" — a needs_more_info case hasn't
  // been classified yet.
  classification?: string;
  status: "routed" | "needs_more_info";
  message: string;
  clarifying_questions?: string[];
}

export function toRequesterView(result: FinalResult): RequesterView {
  const needsMoreInfo = (result.clarifying_questions?.length ?? 0) > 0;

  return {
    ...(result.classification !== undefined ? { classification: result.classification } : {}),
    status: needsMoreInfo ? "needs_more_info" : "routed",
    message: result.response_draft,
    ...(needsMoreInfo ? { clarifying_questions: result.clarifying_questions } : {}),
  };
}
