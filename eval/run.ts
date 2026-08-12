import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";

// Load ANTHROPIC_API_KEY etc. from .env.local before anything touches lib/anthropic.ts.
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { runPipeline, PipelineAbortedError } from "@/lib/pipeline";
import { PRIMARY_MODEL } from "@/lib/anthropic";
import { dedupStore } from "@/lib/dedup";
import { GOLDEN_SET, type GoldenCase } from "./golden-set";
import { scoreCase } from "./scoring";
import { computeMetrics } from "./metrics";
import { printConsoleLine, printConsoleMetrics, buildMarkdownReport } from "./report";
import type { CaseResult } from "./types";

interface Args {
  only?: string;
  category?: string;
  allowFallback: boolean;
  noStep2: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { allowFallback: false, noStep2: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--only") args.only = argv[++i];
    if (argv[i] === "--category") args.category = argv[++i];
    if (argv[i] === "--allow-fallback") args.allowFallback = true;
    if (argv[i] === "--no-step2") args.noStep2 = true;
  }
  return args;
}

/** Returns the step name(s) whose models_used differs from PRIMARY_MODEL, or
 * an empty array if the chain never advanced for this case. When step2 was
 * deliberately skipped for ablation, its synthetic "n/a" model is excluded
 * from this check — that's not a fallback, it's the point of the run. */
function fallbackSteps(result: CaseResult, opts: { skipStep2: boolean }): string[] {
  if (!result.result) return [];
  const used = result.result.decision_metadata.models_used;
  return (Object.entries(used) as [string, string][])
    .filter(([step]) => !(opts.skipStep2 && step === "step2"))
    .filter(([, model]) => model !== PRIMARY_MODEL)
    .map(([step, model]) => `${step} (${model})`);
}

function selectCases(all: GoldenCase[], args: { only?: string; category?: string }): GoldenCase[] {
  let cases = all;
  if (args.only) cases = cases.filter((c) => c.id === args.only);
  if (args.category) cases = cases.filter((c) => c.category === args.category);
  return cases;
}

async function runCase(c: GoldenCase, opts: { noStep2: boolean }): Promise<CaseResult> {
  // Reset dedup state before every case — several golden cases mention
  // overlapping systems (wifi, VPN, dashboards) and would otherwise collide
  // with each other across the run, corrupting corroborating_reports for
  // cases that are not actually related.
  dedupStore.reset();
  try {
    const result = await runPipeline(c.text, { skipStep2ForAblation: opts.noStep2 });
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
  if (args.allowFallback) {
    console.log("--allow-fallback set: model-chain advancement will NOT abort this run.\n");
  }
  if (args.noStep2) {
    console.log(
      "--no-step2 set: ABLATION RUN — Step 2 is skipped and business_impact is a neutral " +
        "placeholder. Not comparable to a normal eval run; written to ablation-no-step2.md.\n"
    );
  }

  const results: CaseResult[] = [];
  for (const c of cases) {
    const r = await runCase(c, { noStep2: args.noStep2 });
    results.push(r);
    printConsoleLine(r);

    if (!args.allowFallback) {
      const fell = fallbackSteps(r, { skipStep2: args.noStep2 });
      if (fell.length > 0) {
        console.error(
          `\n✗✗✗ ABORTING EVAL RUN: model chain advanced during case "${r.id}" — ${fell.join(", ")}.\n` +
            `Numbers produced across mixed models are not comparable to the primary-model baseline.\n` +
            `Re-run once the primary model (${PRIMARY_MODEL}) is available, or pass --allow-fallback ` +
            `to explicitly accept a mixed-model run (e.g. for the Step 6f fallback-verification check).`
        );
        process.exit(1);
      }
    }
  }

  const metrics = computeMetrics(results);
  printConsoleMetrics(metrics);

  const resultsDir = path.resolve(process.cwd(), "eval/results");
  fs.mkdirSync(resultsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPrefix = args.noStep2 ? "ablation-no-step2" : "eval";
  const jsonPath = path.join(resultsDir, `${jsonPrefix}-${timestamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  console.log(`\nRaw results written to ${jsonPath}`);

  // Ablation runs never touch latest.md — that file is the real baseline
  // this run is being compared against, and must not be overwritten by a
  // deliberately degraded configuration.
  const markdown = buildMarkdownReport(results, metrics);
  const mdPath = path.join(resultsDir, args.noStep2 ? "ablation-no-step2.md" : "latest.md");
  fs.writeFileSync(mdPath, markdown);
  console.log(`Report written to ${mdPath}`);
}

main().catch((err) => {
  console.error("Eval run failed with an unexpected error:", err);
  process.exit(1);
});
