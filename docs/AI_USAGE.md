# AI Usage

I used Claude in two modes: as a thinking partner to argue about the design before writing code, and as a component inside the product, where its output is untrusted until validated.

## 1. Prompts that worked

Four constraints did most of the work in the design conversation:

- **One question at a time.** Left alone, the model dumps a wall of assumptions and moves on. Forcing it to ask, wait, then ask again surfaced the assumptions one by one where I could correct them — which is how the sensitive-routing edge case (HR guardrail vs. live incident) got found at all.
- **Give it a stance to attack, not an open question.** "What should the architecture be" returns a survey. "Argue against putting priority in the model" returns something I can push back on.
- **Make it cite something.** Requiring evidence instead of opinion is what surfaced the workflow-vs-agent distinction and the OWASP framing of excessive agency — both ended up as real constraints in the design.
- **Require high confidence before it offers a view.** Otherwise it fills silence with plausible-sounding recommendations. Raising the bar made it say "I don't know, here is how you'd find out" more often, which was more useful than a guess.

## 2. Outputs I rejected

**Letting the model assign priority directly.** The obvious first design. I rejected it because priority is an accountable decision — someone gets woken up over it — and a model's answer cannot be unit-tested, diffed when policy changes, or pointed at by an auditor. The cost was real: three sequential calls, ~21s.

**Code that handled the happy path and skipped the edges.** Generated implementations were consistently reasonable in shape and thin at the boundaries — what happens when the model returns a team not in the registry, when two guardrails fire at once, when a request is sensitive *and* a live incident. Those cases came from me reading the code, not from the code review I asked for. This is the mode where the model is least useful and most confident.

**Document structure that repeated itself.** Left to its own organisation, the same point appeared in three sections under three headings. Most of my editing was deletion, not writing.

## 3. Where it challenged an assumption usefully

**I wanted to build this as an AI agent** — a planner with tools, deciding its own steps. The model argued for a simple, fixed workflow instead, and the argument held up: an agent loop earns its cost when the decomposition is unknown at design time, and triage decomposes the same way every time — what is this, how urgent, who owns it. I would be paying for flexibility I never use, in exchange for decisions I could no longer point at.

What made it more than a refusal was where the agency went instead: in version 2 it comes back, but only at the verification step — read-only and capped, producing better signals rather than decisions. The useful answer wasn't "don't use an agent"; it was "agency belongs in evidence gathering, not in deciding."

## 4. Where I overrode it, and where it fell short

**I overrode it on the shape of the workflow.** Having won the agent argument, the model proposed collapsing the pipeline into two fixed steps. I kept three, and the split is deliberate: each step owns one question — understand, assess, decide — so each can be upgraded without touching the others. That seam is exactly where version 2 lives: the assess step becomes a bounded read-only agent, checking monitoring and resolved tickets, while understand and decide stay untouched. Two steps would have been marginally cheaper today and more expensive at every upgrade after.

**Where it fell short: it optimises inside the frame it's given, and doesn't step outside it.** Asked about version 2, its proposals all clustered on one axis — make the inputs more trustworthy. Good ideas, and they're in the design. But it had separately identified "no feedback loop" as a weakness, and separately proposed retrieval — for scaling the team registry — and it never connected the two. Resolved tickets are both the retrieval source *and* the free labels the feedback loop needs. That connection is mine, and the combined version is better than either half. Noticing that two of its own observations belong together is a different move from answering the question asked — and it didn't make it.