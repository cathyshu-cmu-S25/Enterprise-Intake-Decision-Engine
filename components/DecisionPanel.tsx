import { PriorityBadge } from "./PriorityBadge";

/** Deterministic, code-driven decisions render in a monospace panel — a
 * deliberate visual break from the LLM step cards, to reinforce "code
 * decides, model reasons". */
export function CodePanel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="code-panel animate-fade-in rounded-lg px-4 py-3">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
        {label}
      </div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

export function RuleDecisionPanel({
  level,
  rule_fired,
}: {
  level: string;
  rule_fired: string;
}) {
  return (
    <CodePanel label="Deterministic · priority rule">
      <div className="flex items-center gap-3">
        <PriorityBadge level={level} size="sm" />
        <span className="text-slate-300">{rule_fired}</span>
      </div>
    </CodePanel>
  );
}

export function GateDecisionPanel({
  confidence,
  reason,
  proceed,
}: {
  confidence: string;
  reason: string;
  proceed: boolean;
}) {
  return (
    <CodePanel label="Deterministic · confidence gate">
      <div className="flex items-start gap-3">
        <span
          className={`shrink-0 rounded px-2 py-0.5 text-xs font-bold ${
            proceed ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"
          }`}
        >
          {proceed ? "proceed ✓" : "needs clarification ⚠"}
        </span>
        <span className="text-slate-300">
          confidence: <span className="font-semibold">{confidence}</span> — {reason}
        </span>
      </div>
    </CodePanel>
  );
}

export function GuardrailPanel({ action, reason }: { action: string; reason: string }) {
  return (
    <div className="animate-fade-in rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-amber-600">
        Guardrail fired
      </div>
      <div className="text-sm text-amber-900">
        <span className="font-semibold">{action}</span> — {reason}
      </div>
    </div>
  );
}
