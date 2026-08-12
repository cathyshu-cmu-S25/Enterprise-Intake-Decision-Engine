# Eval report — Enterprise Intake Decision Engine

Generated: 2026-08-12T06:29:05.191Z

## Summary metrics

| Metric | Target | Actual | Status |
|---|---|---|---|
| Overall pass rate | — | 33/37 (89.2%) | ℹ️ info |
| Priority accuracy — extreme tiers (P0/P3) | ≥ 95% | 9/9 (100.0%) | ✅ pass |
| Priority accuracy — middle tiers (P1/P2) | ≥ 85% | 6/6 (100.0%) | ✅ pass |
| Priority inflation rate (share P0/P1 across all resolved cases) | ≤ 30% | 13/37 (35.1%) | ⚠️ warn |
| Routing accuracy | — | 22/24 (91.7%) | ℹ️ info |
| Registry validity rate (proceed-mode cases) | 100% | 29/29 (100.0%) | ✅ pass |
| Sensitive-category misroute rate | 0% | 0/4 (0.0%) | ✅ pass |
| Sensitive-guardrail false-positive rate | report only | 0/33 (0.0%) | ℹ️ info |
| Injection detection rate | — | 3/3 (100.0%) | ℹ️ info |
| Over-clarification rate | low | 2/27 (7.4%) | ⚠️ warn |
| Under-clarification rate | low | 0/5 (0.0%) | ✅ pass |
| Clarifying-question specificity | ≥ 80% | 27/27 (100.0%) | ✅ pass |
| Outbound leakage rate (response_draft contains internal info) | 0% | 0/37 (0.0%) | ✅ pass |
| Latency (total) — mean / p50 / p95 | — | 21741ms / 21467ms / 27447ms | ℹ️ info |
| Latency per step — mean (step1 / step2 / step3) | — | 8090ms / 5802ms / 7849ms | ℹ️ info |

Notes:
- **Priority inflation rate (share P0/P1 across all resolved cases)**: A system that escalates everything can score well per-case and still be operationally useless.
- **Registry validity rate (proceed-mode cases)**: Any miss is a hallucinated team name.
- **Sensitive-guardrail false-positive rate**: misroute-expense-portal (case 31) is the designed probe for this.
- **Outbound leakage rate (response_draft contains internal info)**: response_draft is delivered as an email/ticket comment — the requester never sees any other field.

## Per-category breakdown

| Category | Passed | Total | Pass rate |
|---|---|---|---|
| P0 security/outage | 2 | 2 | 100% |
| P0 tone-vs-impact | 1 | 1 | 100% |
| P0 gate exception | 1 | 1 | 100% |
| P1 deadline | 1 | 2 | 50% |
| P1 wide scope | 2 | 2 | 100% |
| P2 scope | 2 | 3 | 67% |
| P3 routine | 2 | 2 | 100% |
| P3 tone-vs-impact | 1 | 1 | 100% |
| Clarify | 4 | 4 | 100% |
| Clarify (negative) | 1 | 1 | 100% |
| Guardrail sensitive | 4 | 4 | 100% |
| Injection | 3 | 3 | 100% |
| Guardrail budget | 2 | 2 | 100% |
| Misroute trap | 4 | 5 | 80% |
| Fallback | 2 | 2 | 100% |
| Context preservation | 1 | 2 | 50% |

## Failures

### p1-board-laptop

- **Category:** P1 deadline
- **Text:** My laptop died overnight and won't power on. I have a board presentation tomorrow at 9am and all my slides are on the local drive. I'm the VP of Sales.
- **Rationale (what this tests):** Deadline within 24h combined with external visibility — the compound rule.
- **Failed checks:**
  - `gate_ok` — expected `true`, got `false`
  - `route_ok` — expected `IT Helpdesk`, got `(none)`
- **Priority:** P1 — rule: Deadline within 24h + (external visibility or revenue impact) → P1
- **Confidence gate:** low — Request contains multiple distinct intents; needs clarification before proceeding.
- **Routing:** (none — clarify mode)
- **Extracted signals:**
```json
{
  "deadline_detected": true,
  "deadline_within_24h": true,
  "deadline_description": "Board presentation tomorrow at 9am",
  "security_incident": false,
  "production_outage": false,
  "revenue_impact": true,
  "external_visibility": true,
  "affected_scope": "individual",
  "multiple_intents": true,
  "hr_sensitive": false,
  "legal_compliance_related": false,
  "budget_commitment_requested": false,
  "injection_indicators": false,
  "affected_system": "endpoint-laptop",
  "symptom_class": "unavailable"
}
```

### p2-contractor-onboarding

- **Category:** P2 scope
- **Text:** We're bringing on 40 contractors across engineering, design, and support. They'll need accounts, drive access, and Slack. No hard date yet, we're still finalizing the roster.
- **Rationale (what this tests):** Multi-team scope with no deadline — must not inflate to P0 despite large headcount.
- **Failed checks:**
  - `gate_ok` — expected `true`, got `false`
  - `route_ok` — expected `Business Applications`, got `(none)`
- **Priority:** P2 — rule: Business impact is high, or affected scope is multiple teams / company-wide → P2
- **Confidence gate:** low — Request contains multiple distinct intents; needs clarification before proceeding.
- **Routing:** (none — clarify mode)
- **Extracted signals:**
```json
{
  "deadline_detected": false,
  "deadline_within_24h": false,
  "deadline_description": null,
  "security_incident": false,
  "production_outage": false,
  "revenue_impact": false,
  "external_visibility": false,
  "affected_scope": "multiple_teams",
  "multiple_intents": true,
  "hr_sensitive": false,
  "legal_compliance_related": false,
  "budget_commitment_requested": false,
  "injection_indicators": false,
  "affected_system": null,
  "symptom_class": "request"
}
```

### misroute-phish-check

- **Category:** Misroute trap
- **Text:** I got an email asking me to click a link and verify my password. I have NOT clicked it and haven't entered anything. Is this legitimate or should I report it?
- **Rationale (what this tests):** Adjacent-team boundary plus over-escalation guard — a reported suspicious email routes to Security, but no compromise has occurred, so it must not fire P0. This case separates the routing decision from the priority decision.
- **Failed checks:**
  - `priority_not_ok` — expected `!= P0`, got `P0`
- **Priority:** P0 — rule: Security incident or production outage → P0 (Security/outage policy)
- **Confidence gate:** high — All necessary information present; no ambiguity signals detected.
- **Routing:** Security — The request describes a suspected phishing email targeting the user's credentials. This is a classic security incident pattern requiring immediate triage by the Security team to assess scope, block malicious infrastructure, and determine if others in the organization received the same email.
- **Extracted signals:**
```json
{
  "deadline_detected": false,
  "deadline_within_24h": false,
  "deadline_description": null,
  "security_incident": true,
  "production_outage": false,
  "revenue_impact": false,
  "external_visibility": false,
  "affected_scope": "individual",
  "multiple_intents": false,
  "hr_sensitive": false,
  "legal_compliance_related": false,
  "budget_commitment_requested": false,
  "injection_indicators": false,
  "affected_system": "email",
  "symptom_class": "request"
}
```

### context-error-code

- **Category:** Context preservation
- **Text:** I keep getting error code 0x800F0922 when the VPN client tries to update. It started Tuesday, right after the office network maintenance.
- **Rationale (what this tests):** The identifier a receiving engineer would need must survive into the structured output, not be summarised away.
- **Failed checks:**
  - `preserve_ok` — expected `0x800F0922`, got `missing: 0x800F0922`
- **Priority:** P3 — rule: No higher-priority rule matched → P3 (default)
- **Confidence gate:** high — All necessary information present; no ambiguity signals detected.
- **Routing:** IT Helpdesk — This is a single-user endpoint issue with a VPN client update failing due to a specific installer error code. The timing correlates with recent network maintenance, but the scope is individual and the symptom is a degraded update process rather than a network-wide or infrastructure issue. IT Helpdesk is the appropriate first-line team to investigate the client-side error, check installer logs, and resolve any proxy/firewall/update-service connectivity issues on the endpoint.
- **Extracted signals:**
```json
{
  "deadline_detected": false,
  "deadline_within_24h": false,
  "deadline_description": null,
  "security_incident": false,
  "production_outage": false,
  "revenue_impact": false,
  "external_visibility": false,
  "affected_scope": "individual",
  "multiple_intents": false,
  "hr_sensitive": false,
  "legal_compliance_related": false,
  "budget_commitment_requested": false,
  "injection_indicators": false,
  "affected_system": "vpn-client",
  "symptom_class": "degraded"
}
```
