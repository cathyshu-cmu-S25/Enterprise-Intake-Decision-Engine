"use client";

import { useRef, useState } from "react";
import { PRESETS } from "@/config/presets";
import { StepCard, type StepStatus } from "@/components/StepCard";
import { KeyValueList, KeyValueRow } from "@/components/KeyValue";
import { RawJsonToggle } from "@/components/RawJsonToggle";
import {
  RuleDecisionPanel,
  GateDecisionPanel,
  GuardrailPanel,
  ModelFallbackPanel,
} from "@/components/DecisionPanel";
import { FinalResultPanel } from "@/components/FinalResultPanel";
import { PolicyPanel } from "@/components/PolicyPanel";
import { RequesterResultPanel } from "@/components/RequesterResultPanel";
import { toRequesterView } from "@/lib/view/requesterView";
import type { FinalResult } from "@/lib/schemas";

// Loose client-side shapes mirroring lib/schemas.ts (kept local to avoid
// pulling server-only modules into the client bundle).
interface Step1Data {
  stated_ask: string;
  actual_need: string;
  consequence_of_inaction: string;
  signals: Record<string, unknown> & { injection_indicators: boolean };
  missing_information: string[];
  reasoning: string;
}
interface Step2Data {
  business_impact: string;
  impact_reasoning: string;
  estimated_effort: string;
  effort_reasoning: string;
}
interface Step3Data {
  mode: "proceed" | "clarify";
  // Only present in proceed mode.
  classification?: string;
  routing?: { team: string; reason: string };
  clarifying_questions?: string[];
  response_draft: string;
}
interface RuleDecision {
  level: string;
  rule_fired: string;
}
interface GateDecision {
  confidence: string;
  reason: string;
  proceed: boolean;
}
interface GuardrailEvent {
  action: string;
  reason: string;
}
interface ModelFallbackEvent {
  step: 1 | 2 | 3;
  model: string;
}
type SseEvent =
  | { type: "step_start"; step: 1 | 2 | 3; name: string }
  | { type: "step_output"; step: 1 | 2 | 3; data: unknown }
  | { type: "rule_decision"; data: RuleDecision }
  | { type: "gate_decision"; data: GateDecision }
  | { type: "guardrail"; data: GuardrailEvent }
  | { type: "model_fallback"; data: ModelFallbackEvent }
  | { type: "final"; data: FinalResult }
  | { type: "error"; message: string };

async function consumeSSE(response: Response, onEvent: (evt: SseEvent) => void) {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const line = chunk.trim();
      if (!line.startsWith("data:")) continue;
      const jsonStr = line.slice("data:".length).trim();
      if (!jsonStr) continue;
      try {
        onEvent(JSON.parse(jsonStr) as SseEvent);
      } catch {
        // ignore malformed chunk
      }
    }
  }
}

function Step1Content({ data }: { data: Step1Data }) {
  const s = data.signals;
  return (
    <div>
      <KeyValueList>
        <KeyValueRow label="Stated ask" value={data.stated_ask} />
        <KeyValueRow label="Actual need" value={data.actual_need} />
        <KeyValueRow label="If ignored" value={data.consequence_of_inaction} />
        <KeyValueRow
          label="Scope"
          value={String(s.affected_scope ?? "")}
        />
        <KeyValueRow
          label="Signals"
          value={
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(s)
                .filter(([, v]) => typeof v === "boolean" && v === true)
                .map(([k]) => (
                  <span
                    key={k}
                    className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700"
                  >
                    {k}
                  </span>
                ))}
            </div>
          }
        />
        {data.missing_information.length > 0 && (
          <KeyValueRow
            label="Missing info"
            value={
              <ul className="list-inside list-disc">
                {data.missing_information.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            }
          />
        )}
        <KeyValueRow label="Reasoning" value={<span className="italic text-gray-600">{data.reasoning}</span>} />
      </KeyValueList>
      <RawJsonToggle data={data} />
    </div>
  );
}

function Step2Content({ data }: { data: Step2Data }) {
  return (
    <div>
      <KeyValueList>
        <KeyValueRow label="Business impact" value={data.business_impact} />
        <KeyValueRow label="Impact reasoning" value={<span className="italic text-gray-600">{data.impact_reasoning}</span>} />
        <KeyValueRow label="Estimated effort" value={data.estimated_effort} />
        <KeyValueRow label="Effort reasoning" value={<span className="italic text-gray-600">{data.effort_reasoning}</span>} />
      </KeyValueList>
      <RawJsonToggle data={data} />
    </div>
  );
}

function Step3Content({ data }: { data: Step3Data }) {
  return (
    <div>
      <KeyValueList>
        {data.classification && <KeyValueRow label="Classification" value={data.classification} />}
        {data.mode === "proceed" && data.routing && (
          <KeyValueRow label="Routing" value={`${data.routing.team} — ${data.routing.reason}`} />
        )}
        {data.mode === "clarify" && data.clarifying_questions && (
          <KeyValueRow
            label="Clarifying qs"
            value={
              <ul className="list-inside list-disc">
                {data.clarifying_questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            }
          />
        )}
        <KeyValueRow label="Draft" value={<span className="italic text-gray-600">{data.response_draft}</span>} />
      </KeyValueList>
      <RawJsonToggle data={data} />
    </div>
  );
}

export default function Home() {
  const [requestText, setRequestText] = useState("");
  const [running, setRunning] = useState(false);

  const [step1Status, setStep1Status] = useState<StepStatus>("idle");
  const [step2Status, setStep2Status] = useState<StepStatus>("idle");
  const [step3Status, setStep3Status] = useState<StepStatus>("idle");
  const [step1Data, setStep1Data] = useState<Step1Data | null>(null);
  const [step2Data, setStep2Data] = useState<Step2Data | null>(null);
  const [step3Data, setStep3Data] = useState<Step3Data | null>(null);

  const [ruleDecision, setRuleDecision] = useState<RuleDecision | null>(null);
  const [gateDecision, setGateDecision] = useState<GateDecision | null>(null);
  const [guardrailEvents, setGuardrailEvents] = useState<GuardrailEvent[]>([]);
  const [fallbackEvents, setFallbackEvents] = useState<ModelFallbackEvent[]>([]);
  const [finalResult, setFinalResult] = useState<FinalResult | null>(null);
  const [totalMs, setTotalMs] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"operator" | "requester">("operator");

  const currentStepRef = useRef<1 | 2 | 3 | null>(null);

  function resetState() {
    setStep1Status("idle");
    setStep2Status("idle");
    setStep3Status("idle");
    setStep1Data(null);
    setStep2Data(null);
    setStep3Data(null);
    setRuleDecision(null);
    setGateDecision(null);
    setGuardrailEvents([]);
    setFallbackEvents([]);
    setFinalResult(null);
    setTotalMs(null);
    setErrorMessage(null);
    currentStepRef.current = null;
  }

  const setStepStatus = (step: 1 | 2 | 3, status: StepStatus) => {
    if (step === 1) setStep1Status(status);
    if (step === 2) setStep2Status(status);
    if (step === 3) setStep3Status(status);
  };

  async function runTriage() {
    if (!requestText.trim() || running) return;
    resetState();
    setRunning(true);

    try {
      const response = await fetch("/api/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_text: requestText }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setErrorMessage(body.error ?? `Request failed (${response.status})`);
        setRunning(false);
        return;
      }

      await consumeSSE(response, (event) => {
        switch (event.type) {
          case "step_start":
            currentStepRef.current = event.step;
            setStepStatus(event.step, "running");
            break;
          case "step_output":
            currentStepRef.current = null;
            setStepStatus(event.step, "done");
            if (event.step === 1) setStep1Data(event.data as Step1Data);
            if (event.step === 2) setStep2Data(event.data as Step2Data);
            if (event.step === 3) setStep3Data(event.data as Step3Data);
            break;
          case "rule_decision":
            setRuleDecision(event.data);
            break;
          case "gate_decision":
            setGateDecision(event.data);
            break;
          case "guardrail":
            setGuardrailEvents((prev) => [...prev, event.data]);
            break;
          case "model_fallback":
            setFallbackEvents((prev) => [...prev, event.data]);
            break;
          case "final":
            setFinalResult(event.data);
            setTotalMs(event.data.decision_metadata.timings_ms.total);
            break;
          case "error":
            setErrorMessage(event.message);
            if (currentStepRef.current) {
              setStepStatus(currentStepRef.current, "error");
            }
            break;
        }
      });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  const injectionDetected = step1Data?.signals.injection_indicators === true;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Enterprise Intake Decision Engine</h1>
        <p className="mt-1 text-sm text-gray-500">
          LLM reasons, the system decides. Three sequential reasoning steps, streamed live.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,380px)_1fr]">
        {/* Left column */}
        <section className="flex flex-col gap-4">
          <div>
            <label htmlFor="request" className="mb-1.5 block text-sm font-medium text-gray-700">
              Paste an incoming request
            </label>
            <textarea
              id="request"
              value={requestText}
              onChange={(e) => setRequestText(e.target.value)}
              rows={8}
              placeholder="e.g. My laptop died and I have a board presentation tomorrow..."
              className="w-full rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-800 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">
              Presets
            </div>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setRequestText(p.text)}
                  className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:border-blue-300 hover:text-blue-700"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={runTriage}
            disabled={running || !requestText.trim()}
            className="mt-2 w-full rounded-lg bg-gray-900 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {running ? "Running triage…" : "Run Triage"}
          </button>

          {errorMessage && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {errorMessage}
            </div>
          )}
        </section>

        {/* Right column */}
        <section className="flex flex-col gap-4">
          <div className="inline-flex w-fit rounded-lg border border-gray-200 bg-gray-50 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("operator")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                viewMode === "operator"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Operator view
            </button>
            <button
              type="button"
              onClick={() => setViewMode("requester")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                viewMode === "requester"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Requester view
            </button>
          </div>

          {viewMode === "operator" ? (
            <>
              {fallbackEvents.map((f, i) => (
                <ModelFallbackPanel key={i} step={f.step} model={f.model} />
              ))}

              {/* Live reasoning view — the demo centerpiece */}
              <StepCard
                title="1 · Understand"
                status={step1Status}
                badge={
                  injectionDetected ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                      Injection attempt detected — treated as data
                    </span>
                  ) : undefined
                }
              >
                {step1Data && <Step1Content data={step1Data} />}
              </StepCard>

              <StepCard title="2 · Assess" status={step2Status}>
                {step2Data && <Step2Content data={step2Data} />}
              </StepCard>

              <PolicyPanel />

              {ruleDecision && (
                <RuleDecisionPanel level={ruleDecision.level} rule_fired={ruleDecision.rule_fired} />
              )}
              {guardrailEvents.map((g, i) => (
                <GuardrailPanel key={i} action={g.action} reason={g.reason} />
              ))}
              {gateDecision && (
                <GateDecisionPanel
                  confidence={gateDecision.confidence}
                  reason={gateDecision.reason}
                  proceed={gateDecision.proceed}
                />
              )}

              <StepCard title="3 · Decide" status={step3Status}>
                {step3Data && <Step3Content data={step3Data} />}
              </StepCard>

              {finalResult && <FinalResultPanel result={finalResult} />}

              {totalMs !== null && (
                <div className="text-right text-xs text-gray-400">
                  Total latency: <span className="font-medium text-gray-600">{totalMs}ms</span>
                </div>
              )}
              {finalResult && (
                <div className="text-right text-xs text-gray-400">
                  Models used:{" "}
                  <span className="font-medium text-gray-600">
                    step1 {finalResult.decision_metadata.models_used.step1} · step2{" "}
                    {finalResult.decision_metadata.models_used.step2} · step3{" "}
                    {finalResult.decision_metadata.models_used.step3}
                  </span>
                </div>
              )}
            </>
          ) : finalResult ? (
            <RequesterResultPanel view={toRequesterView(finalResult)} />
          ) : running ? (
            <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
              Working on it…
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-200 bg-white p-6 text-sm text-gray-400">
              Run a triage to see what the requester would see.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
