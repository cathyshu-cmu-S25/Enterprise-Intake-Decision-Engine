import type { CaseResult } from "./types";
import type { MetricRow } from "./metrics";

const STATUS_ICON: Record<MetricRow["status"], string> = {
  pass: "✅",
  warn: "⚠️",
  info: "ℹ️",
};

export function printConsoleLine(r: CaseResult): void {
  if (r.aborted) {
    console.log(`✗ ${r.id} — ABORTED: ${r.abortReason}`);
    return;
  }
  if (r.pass) {
    console.log(`✓ ${r.id}`);
    return;
  }
  const failed = r.checks.filter((c) => c.applicable && !c.pass).map((c) => c.name);
  console.log(`✗ ${r.id} — failed: ${failed.join(", ")}`);
}

export function printConsoleMetrics(rows: MetricRow[]): void {
  console.log("\n=== Metrics ===\n");
  for (const row of rows) {
    console.log(`${STATUS_ICON[row.status]} ${row.label}: ${row.actual}  (target: ${row.target})`);
    if (row.note) console.log(`   note: ${row.note}`);
  }
}

function categoryBreakdown(results: CaseResult[]): { category: string; passed: number; total: number }[] {
  const map = new Map<string, { passed: number; total: number }>();
  for (const r of results) {
    const entry = map.get(r.category) ?? { passed: 0, total: 0 };
    entry.total += 1;
    if (r.pass) entry.passed += 1;
    map.set(r.category, entry);
  }
  return [...map.entries()].map(([category, v]) => ({ category, ...v }));
}

export function buildMarkdownReport(results: CaseResult[], metrics: MetricRow[]): string {
  const lines: string[] = [];
  const generatedAt = new Date().toISOString();

  lines.push("# Eval report — Enterprise Intake Decision Engine");
  lines.push("");
  lines.push(`Generated: ${generatedAt}`);
  lines.push("");

  lines.push("## Summary metrics");
  lines.push("");
  lines.push("| Metric | Target | Actual | Status |");
  lines.push("|---|---|---|---|");
  for (const row of metrics) {
    lines.push(`| ${row.label} | ${row.target} | ${row.actual} | ${STATUS_ICON[row.status]} ${row.status} |`);
  }
  const notes = metrics.filter((r) => r.note);
  if (notes.length > 0) {
    lines.push("");
    lines.push("Notes:");
    for (const n of notes) {
      lines.push(`- **${n.label}**: ${n.note}`);
    }
  }
  lines.push("");

  lines.push("## Per-category breakdown");
  lines.push("");
  lines.push("| Category | Passed | Total | Pass rate |");
  lines.push("|---|---|---|---|");
  for (const b of categoryBreakdown(results)) {
    const rate = b.total === 0 ? "n/a" : `${((b.passed / b.total) * 100).toFixed(0)}%`;
    lines.push(`| ${b.category} | ${b.passed} | ${b.total} | ${rate} |`);
  }
  lines.push("");

  const failures = results.filter((r) => !r.pass);
  lines.push("## Failures");
  lines.push("");
  if (failures.length === 0) {
    lines.push("None.");
  } else {
    for (const f of failures) {
      lines.push(`### ${f.id}`);
      lines.push("");
      lines.push(`- **Category:** ${f.category}`);
      lines.push(`- **Text:** ${f.text}`);
      lines.push(`- **Rationale (what this tests):** ${f.rationale}`);
      if (f.aborted) {
        lines.push(`- **Aborted:** ${f.abortReason}`);
      } else {
        const failedChecks = f.checks.filter((c) => c.applicable && !c.pass);
        lines.push("- **Failed checks:**");
        for (const c of failedChecks) {
          lines.push(`  - \`${c.name}\` — expected \`${c.expected}\`, got \`${c.actual}\``);
        }
        const result = f.result!;
        lines.push(`- **Priority:** ${result.priority.level} — rule: ${result.priority.rule_fired}`);
        lines.push(`- **Confidence gate:** ${result.decision_metadata.confidence.level} — ${result.decision_metadata.confidence.reason}`);
        lines.push(`- **Routing:** ${result.routing ? `${result.routing.team} — ${result.routing.reason}` : "(none — clarify mode)"}`);
        lines.push("- **Extracted signals:**");
        lines.push("```json");
        lines.push(JSON.stringify(result.decision_metadata.signals, null, 2));
        lines.push("```");
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}
