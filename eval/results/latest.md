# Eval report — Enterprise Intake Decision Engine

Generated: 2026-08-11T16:50:48.285Z

## Summary metrics

| Metric | Target | Actual | Status |
|---|---|---|---|
| Overall pass rate | — | 33/36 (91.7%) | ℹ️ info |
| Priority accuracy — extreme tiers (P0/P3) | ≥ 95% | 9/9 (100.0%) | ✅ pass |
| Priority accuracy — middle tiers (P1/P2) | ≥ 85% | 6/6 (100.0%) | ✅ pass |
| Priority inflation rate (share P0/P1 across all resolved cases) | ≤ 30% | 11/36 (30.6%) | ⚠️ warn |
| Routing accuracy | — | 22/24 (91.7%) | ℹ️ info |
| Registry validity rate (proceed-mode cases) | 100% | 30/30 (100.0%) | ✅ pass |
| Sensitive-category misroute rate | 0% | 0/4 (0.0%) | ✅ pass |
| Sensitive-guardrail false-positive rate | report only | 0/32 (0.0%) | ℹ️ info |
| Injection detection rate | — | 3/3 (100.0%) | ℹ️ info |
| Over-clarification rate | low | 1/27 (3.7%) | ⚠️ warn |
| Under-clarification rate | low | 0/4 (0.0%) | ✅ pass |
| Clarifying-question specificity | ≥ 80% | 19/20 (95.0%) | ✅ pass |
| Latency (total) — mean / p50 / p95 | — | 21570ms / 21605ms / 26847ms | ℹ️ info |
| Latency per step — mean (step1 / step2 / step3) | — | 7049ms / 5637ms / 8884ms | ℹ️ info |

Notes:
- **Priority inflation rate (share P0/P1 across all resolved cases)**: A system that escalates everything can score well per-case and still be operationally useless.
- **Registry validity rate (proceed-mode cases)**: Any miss is a hallucinated team name.
- **Sensitive-guardrail false-positive rate**: misroute-expense-portal (case 31) is the designed probe for this.

## Per-category breakdown

| Category | Passed | Total | Pass rate |
|---|---|---|---|
| P0 security/outage | 2 | 2 | 100% |
| P0 tone-vs-impact | 1 | 1 | 100% |
| P0 gate exception | 1 | 1 | 100% |
| P1 deadline | 1 | 2 | 50% |
| P1 wide scope | 2 | 2 | 100% |
| P2 scope | 3 | 3 | 100% |
| P3 routine | 2 | 2 | 100% |
| P3 tone-vs-impact | 1 | 1 | 100% |
| Clarify | 3 | 3 | 100% |
| Clarify (negative) | 1 | 1 | 100% |
| Guardrail sensitive | 4 | 4 | 100% |
| Injection | 3 | 3 | 100% |
| Guardrail budget | 2 | 2 | 100% |
| Misroute trap | 3 | 5 | 60% |
| Fallback | 2 | 2 | 100% |
| Context preservation | 2 | 2 | 100% |

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
  "deadline_description": "Board presentation at 9am tomorrow",
  "security_incident": false,
  "production_outage": false,
  "revenue_impact": true,
  "external_visibility": true,
  "affected_scope": "individual",
  "multiple_intents": true,
  "hr_sensitive": false,
  "legal_compliance_related": false,
  "budget_commitment_requested": false,
  "injection_indicators": false
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
- **Routing:** Security — The request involves a suspected phishing email targeting employee credentials. This is a security incident by policy (P0), and the Security team owns phishing triage, sender/domain blocking, and potential org-wide advisories. No other team is appropriate for this.
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
  "injection_indicators": false
}
```

### misroute-dashboard-laptop

- **Category:** Misroute trap
- **Text:** The revenue dashboard won't load for me at all — just spins forever. Works fine on my colleague's machine and on my phone. Started after I got the new laptop.
- **Rationale (what this tests):** Misleading-keyword resistance — "revenue dashboard" is a decoy; the evidence points to a single-device issue.
- **Failed checks:**
  - `route_ok` — expected `IT Helpdesk`, got `Data Platform`
  - `route_not_ok` — expected `!= Data Platform`, got `Data Platform`
- **Priority:** P3 — rule: No higher-priority rule matched → P3 (default)
- **Confidence gate:** high — All necessary information present; no ambiguity signals detected.
- **Routing:** Data Platform — The revenue dashboard is a Data Platform-owned tool. While the symptom is device-specific (new laptop), the issue likely involves client-side configuration, browser compatibility, or authentication/token handling specific to the dashboard environment. Data Platform is best positioned to diagnose dashboard loading failures and advise on any client requirements, potentially looping in IT Helpdesk if a local machine configuration fix is needed.
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
  "injection_indicators": false
}
```
