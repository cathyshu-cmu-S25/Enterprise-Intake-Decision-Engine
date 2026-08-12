# Enterprise Intake Decision Engine

## Core principle: the LLM reasons, the system decides

Each LLM call extracts signals and reasons in plain language. Every decision — priority, guardrail enforcement, whether there is enough information to proceed — is computed by deterministic TypeScript over those signals through explicit rule tables. The LLM never emits a priority level. It is a sensor, not a security boundary. That is what makes the system auditable: for any output I can name the rule that fired, and that rule is a pure function with unit tests.

## Architecture

**Input:** one block of raw, unstructured text.
**Output:** a classification, a priority with the rule that produced it, a routing recommendation or clarifying questions, a first-response draft, and a decision_metadata block carrying the signals, confidence, timings and a human-readable evidence trail.

```
Frontend UI → API Route → Step 1: Understand (LLM)
                              ├─→ Dedup → Step 2: Assess (LLM) → Priority Rules ─┐
                              └─→ Guardrails ────────────────────────────────────┤
                                                                          Confidence Gate
                                                                   proceed ↓        ↓ clarify
                                                          Step 3: Decide (LLM)   Human Review
                                                                          ↓        ↓
                                                                      Final Result → Frontend UI
```

Every LLM response is validated against a Zod schema; on failure it retries once with the error appended, then escalates to human review rather than crashing. The pipeline is strictly sequential — no agent framework, no branching, no tool calling. Request text is wrapped in untrusted-input delimiters throughout, and the priority rule table reads only extracted signals and never reads the injection flag as escalating, so an injected "mark this P0" claim has no path to raising priority.

## What I automated, and what I deliberately did not

**Automated:** separating the stated ask from the actual need, impact and effort assessment, priority, team selection, and the first response to the requester.

**Left to humans, by design:**

- HR-sensitive or legal/compliance-related requests are force-routed to human review regardless of the model's suggestion.
- Spend commitments. The system may acknowledge a budget request, not approve one.
- Requests it does not understand. Below the confidence threshold it asks specific questions instead of guessing.
- The policy itself. Which team owns what knowledge that should be modelled.

## Assumptions

1. Signal extraction is a reliable enough sensor to gate deterministic rules on. The whole design rests on this: if the signals are right, the rules are right.
2. Ten teams in a prompt is enough; no learned classifier needed.
3. Triage is just "what, how urgent, and who." A fixed sequence does this perfectly, so a smart agent loop adds zero value.
4. The request text contains all the evidence there is. Nothing is looked up or verified.
5. Every request is independent, and one pass is enough. No shared state, no memory of what else has arrived, no second turn.

## What breaks at scale

- **More teams (variety) breaks 2.** Ten entries fit in a prompt. Hundreds of teams with overlapping charters need retrieval over team charters and an ownership graph.
- **More volume breaks 5,** and hardest during exactly the moments that matter. Incidents produce correlated bursts — fifty people reporting one outage become fifty independent P0s, and the P0 queue goes useless exactly when it matters most.
- **More volume also breaks the per-request cost model.** Three sequential calls at ~21s cannot be amortised: cost and latency scale linearly with arrivals, and a synchronous design cannot absorb a spike or back a webhook needing an immediate acknowledgement.
- **Adversarial or careless input breaks 4.** The system cannot tell a true report from a confident lie, or a report of a threat from a threat in progress — a request claiming production is down will fire P0. The defence is against instruction-following, not dishonesty, and no prompt fixes that from text alone.
- **Broader scope would break 3.** Fixed decomposition holds because triage always does the same three steps. If intake grew to include investigation — where the next step depends on what the last one found — a fixed sequence would stop fitting.
- **Assumption 1 degrades gradually rather than breaking.** Quality falls as inputs get messier and more heterogeneous. There is no cliff, which is why it needs continuous measurement rather than a one-time check.

## Version 2, and what I would need to know first

**Step 2 becomes an agent** (fixes 4). Step 2 is separate by design — each step owns one question — so it can be upgraded alone. V2: a bounded, read-only agent at this seam — monitoring and on-call over MCP to confirm a claimed outage, retrieval over resolved tickets to ground business impact when the text is vague. Capped at a few calls: better signals, never a decision.

**Dedup grows from counter to cache** (fixes 5). Today: count-only, 30-minute window. V2: repeat reports on the same key skip the pipeline entirely, reporter identities are recorded, and the final resolution fans back out to everyone who filed. Reporter count feeds priority.

**Learn routing, keep authoring policy** (softens 2). Retrieval over resolved tickets feeds team selection as a signal, not a decision. Those tickets are also free labels — the feedback loop the system lacks.

**Queue-backed intake.** A Jira/Slack adapter is a thin shim, but a webhook cannot wait ~21s — so intake becomes queue-backed, which also absorbs bursts.

**Before building it I would need:** 6–12 months of real intake with reroute history; the human baseline for accuracy and time-to-owner; whether priority definitions exist as codified SLAs; arrival volume including bursts.