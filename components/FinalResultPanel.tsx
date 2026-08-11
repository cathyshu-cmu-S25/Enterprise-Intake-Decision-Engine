import { PriorityBadge } from "./PriorityBadge";
import { CopyButton } from "./CopyButton";

export interface FinalResultLike {
  classification: string;
  priority: { level: string; rule_fired: string };
  routing: { team: string; reason: string } | null;
  response_draft: string;
  clarifying_questions?: string[];
  decision_metadata: {
    confidence: { level: string; reason: string };
    evidence: string[];
  };
}

export function FinalResultPanel({ result }: { result: FinalResultLike }) {
  const isClarification = !result.routing && !!result.clarifying_questions?.length;

  return (
    <div className="animate-fade-in rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-4">
        <div className="flex items-center gap-3">
          <PriorityBadge level={result.priority.level} />
          <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">
            {result.classification}
          </span>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            result.decision_metadata.confidence.level === "high"
              ? "bg-emerald-50 text-emerald-700"
              : result.decision_metadata.confidence.level === "medium"
                ? "bg-amber-50 text-amber-700"
                : "bg-red-50 text-red-700"
          }`}
        >
          confidence: {result.decision_metadata.confidence.level}
        </span>
      </div>

      {isClarification ? (
        <div className="mt-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-600">
            Needs clarification
          </h4>
          <ul className="list-inside list-disc space-y-1 text-sm text-gray-800">
            {result.clarifying_questions!.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      ) : (
        result.routing && (
          <div className="mt-4">
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Routing
            </h4>
            <p className="text-sm text-gray-800">
              <span className="font-semibold">{result.routing.team}</span> — {result.routing.reason}
            </p>
          </div>
        )
      )}

      <div className="mt-4 rounded-lg border-2 border-dashed border-blue-200 bg-blue-50/20 p-3">
        <div className="mb-1 flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-blue-700">
            Sent to requester — this is the entire outbound artifact
          </h4>
          <CopyButton text={result.response_draft} />
        </div>
        <blockquote className="rounded-lg border-l-4 border-blue-300 bg-white px-4 py-3 text-sm italic text-gray-700">
          {result.response_draft}
        </blockquote>
      </div>

      <div className="mt-4">
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Evidence
        </h4>
        <ul className="space-y-1 text-xs text-gray-600">
          {result.decision_metadata.evidence.map((e, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-gray-300">•</span>
              <span>{e}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
