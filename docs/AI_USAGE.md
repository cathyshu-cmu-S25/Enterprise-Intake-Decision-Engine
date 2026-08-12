# AI Usage

I used Claude in two modes, and keeping them apart mattered. As a **thinking partner**, to argue about the design before writing code. As a **component** inside the product, where its output is untrusted until validated.

## 1. Prompts that worked

**For the design conversation, four constraints did most of the work:**

- **One question at a time.** Left alone the model returns a wall of assumptions and moves on. Forcing it to ask, wait, then ask again meant the assumptions surfaced one at a time where I could correct them — which is how the sensitive-routing edge cases got found at all.
- **Give it a stance to argue from, not an open question.** "What should the architecture be" returns a survey. "Argue against putting priority in the model" returns something I can push back on.
- **Make it cite something.** Requiring evidence rather than an opinion is what surfaced the workflow-versus-agent distinction and the OWASP framing of excessive agency, both of which ended up shaping real constraints in the design.
- **Require high confidence before it offers a view.** Otherwise it fills silence with plausible-sounding recommendations. Raising the bar made it say "I don't know, here is how you'd find out" more often, which was more useful than a guess.

Inside the product, one pattern mattered more than any wording: **replace a definition with an explicit test.** Asking for "what a skilled operator would need to act on this" produced device models and OS versions, because "act on" reads as *resolve*. Replacing it with "if you can name a plausible owning team and a plausible urgency from what is written, this should be empty" fixed it. The same move fixed the legal/compliance signal: "is the requester asking for legal judgment, or reporting an operational problem?" **A definition invites the model to reason about category membership; a test tells it what the answer is for.**

One more that held up: wrapping the request in untrusted-input delimiters at every step and stating plainly that nothing inside is an instruction. Injection detection is 3/3 on the golden set, including a delimiter-spoofing attempt and one that tried to *suppress* priority rather than inflate it. But the prompt is the weaker half of that defence — the real guarantee is that the rule table never receives the request text at all.

## 2. Outputs I rejected

**Letting the model assign priority directly.** The obvious first design, and what I would have shipped without an evaluation. I rejected it because a priority level is an accountable decision — someone gets woken up — and a model's answer cannot be unit-tested, diffed when policy changes, or pointed at by an auditor. The cost was real: three sequential calls, ~21s.

**Raising the gate threshold to fix over-clarification.** When the rate came back high, the model's suggestion — and my instinct — was to move the threshold from two missing items to four. I didn't. The threshold was reading a miscalibrated signal; moving it would have hidden that and needed re-tuning every time a signal was added.

**Code that handled the happy path and skipped the edges.** Generated implementations were consistently reasonable in shape and thin at the boundaries — what happens when the model returns a team that isn't in the registry, when two guardrails fire at once, when a request is sensitive *and* a live incident. Those cases came from me reading the code, not from the code review I asked for. This is the mode where the model is least useful and most confident.

**Document structure that repeated itself.** Left to its own organisation, the same point appeared in three sections under three headings. Most of my editing was deletion, not writing.

## 3. Where it challenged an assumption usefully

**I wanted to build this as an AI agent.** That was my starting position — a planner with tools, deciding its own steps. The model argued against it, and the argument held up: an agent loop earns its cost when the decomposition is unknown at design time, and triage decomposes the same way every time — what is this, how urgent, who owns it. Flexibility I would be paying for and never using, in exchange for decisions I could no longer point at.

What made it more than a refusal was where the agency went instead. In version 2 it comes back — but only at the verification step, read-only and capped, producing better signals rather than decisions. **The useful answer wasn't "don't use an agent," it was "agency belongs in evidence gathering, not in deciding."**

**The evaluation challenged me twice more, and harder.** Before it existed, the confidence gate and the sensitive-category guardrail were both built and unit-tested in isolation, and every test passed. The first full run against labelled cases showed that `hr_sensitive` and `legal_compliance_related` were not the same kind of signal at all — one describes what a request *is about*, the other is usually a downstream *property* of an operational problem — and that live security incidents were being force-routed away from Security as a result. A unit test only proves a function does what its author intended. It cannot tell you the intention was miscalibrated.

Worth saying that this only worked because the cases were written to probe specific boundaries rather than to sample typical traffic — one case is a calm, understated report of a real breach, another is an all-caps complaint about a font, and one exists purely as the sensitive guardrail's false-positive probe. **The evaluation found those two errors because it was built to go looking for them.**

## 4. Where I had to override it, and where it fell short

**Structurally, in three places.** The rule table never receives the request text, so no model output — or future prompt change — can set priority. Guardrail routing overrides the model's team choice after the fact and writes the override into the evidence trail rather than applying it silently; a *suppressed* guardrail is logged the same way, because not firing is also a decision. And a schema-validation failure never triggers a model fallback, even though "try a different model" is the reflex: that would fix the symptom while concealing that the prompt needs work.

**It also fell short on future work, in a way I didn't expect.** Asked what version 2 should be, the model's proposals all clustered on one axis: make the inputs more trustworthy — verify claimed outages against monitoring, deduplicate correlated reports, type the missing-information field. Good ideas, and they're in the design. But it never proposed **learning from what the organisation already knows** — retrieval over resolved tickets and their final routing, so the system improves from history rather than only from better sensing.

The sharp part: it had separately identified "no feedback loop" as a weakness, and had separately proposed retrieval — for scaling the team registry. **It never connected the two.** Resolved tickets are both the retrieval source and the free labels the feedback loop needs. That connection is mine, and the combined version is better than either half. My reading is that the model optimises within the frame it was given; noticing that two of its own observations belong together is a different move, and not one it made.

Two smaller gaps, both mine to catch. I first specified the requester's privacy boundary as a separate UI view that hid internal fields — partway through I realised I had invented an artefact that doesn't exist, since a requester never opens this app and only receives the draft as an email. The boundary had to hold on the text, which is now asserted on every case. The model implemented what I asked for and didn't question the premise. And the evaluation has a blind spot of its own: because the runner deliberately calls the pipeline without the event stream, it cannot see Step 1's raw output, so the check that concrete details survive into the handoff is narrower than I originally specified.
