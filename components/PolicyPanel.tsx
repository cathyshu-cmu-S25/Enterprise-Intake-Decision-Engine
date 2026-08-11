import { PRIORITY_POLICY, POLICY_VERSION } from "@/config/policy";
import { PriorityBadge } from "./PriorityBadge";

/**
 * Renders the priority policy as data, not prose — the point being that
 * "what does P0 mean" is answered by reading config/policy.ts, not by
 * reading a paragraph someone wrote about the code.
 */
export function PolicyPanel() {
  return (
    <details className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-xs text-gray-600">
      <summary className="cursor-pointer select-none font-medium text-gray-500 hover:text-gray-700">
        Priority policy — {PRIORITY_POLICY.length} rules, evaluated top-down (version {POLICY_VERSION})
      </summary>
      <ol className="mt-3 flex flex-col gap-2">
        {PRIORITY_POLICY.map((rule, i) => (
          <li key={rule.id} className="flex items-start gap-2">
            <span className="mt-0.5 w-4 shrink-0 text-gray-300">{i + 1}.</span>
            <PriorityBadge level={rule.level} size="sm" />
            <span className="text-gray-700">{rule.description}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
