import type { FinalResult } from "./schemas";
import { SENSITIVE_INTAKE_REVIEW } from "./teams";

/**
 * What a requester is allowed to see. This is an explicit allow-list, not a
 * subtraction from FinalResult — nothing reaches this shape unless it's
 * named here. No signals, no rule_fired, no guardrail evidence, no
 * confidence label, no timings, no priority level, and no internal team
 * names (forced-review cases get a generic "handled by a person" message
 * instead of naming the review queue).
 */
export interface RequesterView {
  classification: string;
  status: "routed" | "needs_more_info";
  message: string;
  clarifying_questions?: string[];
}

/**
 * Projects a FinalResult down to what the requester should see. This is a
 * privacy control, not a layout preference: for an HR-sensitive request the
 * requester must not see hr_sensitive, the confidence label, or a
 * "Routing overridden" evidence line naming the review queue.
 */
export function toRequesterView(result: FinalResult): RequesterView {
  const needsMoreInfo = (result.clarifying_questions?.length ?? 0) > 0;

  if (needsMoreInfo) {
    return {
      classification: result.classification,
      status: "needs_more_info",
      message: result.response_draft,
      clarifying_questions: result.clarifying_questions,
    };
  }

  // A guardrail-forced case may carry a response_draft the LLM wrote before
  // the routing override happened (Step 3 doesn't know a guardrail is about
  // to override its suggested team) — show a generic, always-accurate
  // message instead of a draft that may reference a team the request isn't
  // actually going to.
  const isForcedReview = result.routing?.team === SENSITIVE_INTAKE_REVIEW;

  return {
    classification: result.classification,
    status: "routed",
    message: isForcedReview
      ? "This request is being handled by a person on our team. You'll hear back directly from them."
      : result.response_draft,
  };
}
