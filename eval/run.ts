import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";

// Load ANTHROPIC_API_KEY etc. from .env.local before anything touches lib/anthropic.ts.
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { runPipeline, PipelineAbortedError } from "@/lib/pipeline";
import { GOLDEN_SET, type GoldenCase } from "./golden-set";
import { scoreCase } from "./scoring";
import { computeMetrics } from "./metrics";
import { printConsoleLine, printConsoleMetrics, buildMarkdownReport } from "./report";
import type { CaseResult } from "./types";

function parseArgs(argv: string[]): { only?: string; category?: string } {
  const args: { only?: string; category?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--only") args.only = argv[++i];
    if (argv[i] === "--category") args.category = argv[++i];
  }
  return args;
}

function selectCases(all: GoldenCase[], args: { only?: string; category?: string }): GoldenCase[] {
  let cases = all;
  if (args.only) cases = cases.filter((c) => c.id === args.only);
  if (args.category) cases = cases.filter((c) => c.category === args.category);
  return cases;
}

async function runCase(c: GoldenCase): Promise<CaseResult> {
  try {
    const result = await runPipeline(c.text);
    const { checks, pass } = scoreCase(c, result);
    return {
      id: c.id,
      category: c.category,
      text: c.text,
      rationale: c.rationale,
      expect: c.expect,
      pass,
      checks,
      aborted: false,
      result,
      latencyMs: result.decision_metadata.timings_ms.total,
    };
  } catch (err) {
    if (err instanceof PipelineAbortedError) {
      return {
        id: c.id,
        category: c.category,
        text: c.text,
        rationale: c.rationale,
        expect: c.expect,
        pass: false,
        checks: [],
        aborted: true,
        abortReason: err.message,
      };
    }
    throw err;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cases = selectCases(GOLDEN_SET, args);

  if (cases.length === 0) {
    console.error("No golden-set cases matched the given filters.");
    process.exit(1);
  }

  console.log(`Running ${cases.length} case(s) sequentially...\n`);

  const results: CaseResult[] = [];
  for (const c of cases) {
    const r = await runCase(c);
    results.push(r);
    printConsoleLine(r);
  }

  const metrics = computeMetrics(results);
  printConsoleMetrics(metrics);

  const resultsDir = path.resolve(process.cwd(), "eval/results");
  fs.mkdirSync(resultsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(resultsDir, `eval-${timestamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  console.log(`\nRaw results written to ${jsonPath}`);

  const markdown = buildMarkdownReport(results, metrics);
  const mdPath = path.join(resultsDir, "latest.md");
  fs.writeFileSync(mdPath, markdown);
  console.log(`Report written to ${mdPath}`);
}

main().catch((err) => {
  console.error("Eval run failed with an unexpected error:", err);
  process.exit(1);
});
