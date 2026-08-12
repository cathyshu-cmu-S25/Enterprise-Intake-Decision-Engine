import type { RequesterView } from "@/lib/requesterView";

/**
 * Plain, non-technical rendering of RequesterView. Deliberately styled
 * nothing like the operator view (no monospace, no code panels, no
 * signals/evidence) — this is what an actual requester sees.
 */
export function RequesterResultPanel({ view }: { view: RequesterView }) {
  return (
    <div className="animate-fade-in rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {view.classification && (
          <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">
            {view.classification}
          </span>
        )}
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            view.status === "routed"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          {view.status === "routed" ? "We're on it" : "We need a bit more information"}
        </span>
      </div>

      <p className="whitespace-pre-wrap text-base leading-relaxed text-gray-800">{view.message}</p>

      {view.clarifying_questions && view.clarifying_questions.length > 0 && (
        <ul className="mt-4 list-inside list-disc space-y-1.5 text-sm text-gray-700">
          {view.clarifying_questions.map((q, i) => (
            <li key={i}>{q}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
