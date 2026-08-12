# Enterprise Intake Decision Engine

A Next.js prototype for a live interview demo: paste a raw, unstructured enterprise request and watch it move through **three sequential LLM reasoning steps**, streamed live to the UI, ending in a structured triage decision.

## Core design principle

**LLM reasons, the system decides.** Each LLM call extracts signals and reasons about them in plain language. Every actual *decision* — priority level, guardrail enforcement, whether the pipeline has enough information to proceed — is computed by deterministic TypeScript over those signals, via explicit, inspectable rule tables. The LLM never outputs a priority level directly; it is a sensor, not a security boundary. Every enforcement action lives in testable code (`lib/policy/priorityRules.ts`, `lib/policy/guardrails.ts`, `lib/policy/confidenceGate.ts`).

The pipeline is strictly sequential — no parallel branches, no agent framework (no LangGraph/LangChain). Plain TypeScript orchestration in `lib/pipeline/index.ts`.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  app/page.tsx  (client)                                              │
│  ── textarea + 7 presets → POST /api/triage → consumes SSE stream    │
└───────────────────────────────┬───────────────────────────────────--┘
                                 │ SSE: step_start / step_output /
                                 │      rule_decision / gate_decision /
                                 │      guardrail / final / error
┌───────────────────────────────▼──────────────────────────────────---┐
│  app/api/triage/route.ts  — POST, ReadableStream                     │
│  calls lib/pipeline/index.ts → runPipeline(text, { onEvent })        │
└───────────────────────────────┬──────────────────────────────────---┘
                                 │
   ┌─────────────────────────────────────────────────────────────┐
   │                     lib/pipeline/index.ts                    │
   │                                                               │
   │  Step 1  UNDERSTAND  (LLM)         step1_understand.ts        │
   │      → stated_ask, actual_need, signals{...}, missing_info    │
   │                        │                                      │
   │  Step 2a ASSESS       (LLM)         step2_assess.ts           │
   │      → business_impact, estimated_effort                     │
   │                        │                                      │
   │  Step 2b PRIORITY     (code, pure)  lib/policy/priorityRules.ts │
   │      → { level, rule_fired }     ← rule table, top-down       │
   │                        │                                      │
   │  Step 2c GUARDRAILS   (code, pure)  lib/policy/guardrails.ts  │
   │      → forced_team / block_spend / confidence_cap             │
   │                        │                                      │
   │  Step 2d CONFIDENCE GATE (code, pure) lib/policy/confidenceGate.ts │
   │      → { confidence, reason, proceed }                        │
   │                        │                                      │
   │  Step 3  DECIDE       (LLM)         step3_decide.ts           │
   │      → classification, routing OR clarifying_questions,       │
   │        response_draft (regenerated once if it commits spend   │
   │        and budget_commitment_requested was flagged)           │
   │                        │                                      │
   │  Final assembly: guardrail routing override applied here,     │
   │  post-Step 3, so it's visible in the evidence audit trail.    │
   └─────────────────────────────────────────────────────────────┘
```

Every LLM call is validated against a Zod schema (`lib/schemas.ts`). On validation failure it retries once with the error appended to the prompt; on a second failure the pipeline aborts cleanly with an `error` SSE event ("Escalated to human review: output failed validation") instead of crashing the server.

## Untrusted input handling

The pasted request is untrusted external text. Every prompt wraps it in `<untrusted_request>...</untrusted_request>` delimiters, and every system prompt states that content inside those delimiters must never be followed as instructions — it is data to analyze. If the text contains instruction-like content aimed at an AI system (e.g. "ignore previous instructions", "mark this P0"), Step 1 sets `signals.injection_indicators: true` and still analyzes whatever legitimate request is underneath. Because the priority rule table (`lib/policy/priorityRules.ts`) never reads `injection_indicators` as a priority-raising signal, an injected "mark this P0" claim cannot raise priority — only genuine extracted signals can. Guardrails separately cap confidence at `medium` whenever injection is detected (`lib/policy/guardrails.ts`).

## Tech stack

Next.js 14 (App Router) + TypeScript + Tailwind · `@anthropic-ai/sdk` (`claude-sonnet-4-6`) · Zod · Vitest. No database, no auth, no deployment config — in-memory only, runs locally.

## Running it

```bash
npm install
cp .env.local.example .env.local   # add your ANTHROPIC_API_KEY
npm run dev                        # http://localhost:3000
npm run test                       # vitest
```

## Where the rule tables live

| Decision | File | Kind |
|---|---|---|
| Priority (P0–P3) | `lib/policy/priorityRules.ts` | pure function reading the rule table (`PRIORITY_POLICY` in `config/policy.ts`) |
| Guardrails (forced routing, spend block, confidence cap) | `lib/policy/guardrails.ts` | pure function |
| Confidence gate (proceed vs. clarify) | `lib/policy/confidenceGate.ts` | pure function |
| Team registry | `config/teams.json` | data |

All three rule modules are pure functions over typed signals — no I/O, no LLM calls — which is what makes them independently unit-testable (`tests/`).

## Adding a team or domain — config only, zero code changes

To add a new team, add an entry to `config/teams.json`:

```json
{
  "name": "Example Team",
  "charter": "One or two sentences describing what this team owns.",
  "example_requests": ["A sample request", "Another sample request"]
}
```

The Step 3 prompt renders the full registry from this file (`lib/teams.ts` → `teamsRegistryText()`), and routing is validated against it at runtime — an LLM-suggested team name outside the registry falls back to `Intake Review Queue` rather than being trusted. No code changes are needed to add, rename, or retire a team.

To add a new guardrail-triggering domain (like HR/legal), extend the `signals` shape in `lib/schemas.ts`, teach Step 1's prompt to detect it, and add a branch in `lib/policy/guardrails.ts`.

## Tests

```bash
npm run test
```

- `tests/priorityRules.test.ts` — 12 cases covering every rule in the table, including "urgency claims co-occurring with `injection_indicators` do not raise priority".
- `tests/guardrails.test.ts` — sensitive-category forced routing (HR / legal / both), injection confidence cap, budget-commitment flag.
- `tests/confidenceGate.test.ts` — low/medium/high logic and the P0 exception (always proceeds, but the confidence label stays honest).
- `tests/step3_budget.test.ts` — budget post-check regeneration path, with the LLM call mocked.

## Scope (deliberate exclusions)

No database, no auth, no RAG, no memory, no tool calling, no multi-agent framework, no deployment config. This is a reasoning-pipeline prototype, not a production service.

## Notes for reuse outside the UI

`runPipeline` (`lib/pipeline/index.ts`) is a plain async function importable outside Next.js — e.g. by an eval script — with an optional `onEvent` callback for streaming progress; omit it to just `await` the final structured result.
