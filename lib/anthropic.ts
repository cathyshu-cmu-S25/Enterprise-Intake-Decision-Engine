import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

export const MAX_TOKENS = 1500;
export const TEMPERATURE = 0.2;

// Model chain: primary, then a smaller/faster fallback in the same Claude
// family. Configuration, not a hardcoded constant — both come from env vars
// with the current model as the primary default. This is a same-provider,
// same-credential fallback: it protects against model-level unavailability
// (529 overloaded, 503, per-model rate limits, a model retired or not
// enabled on the account). It does NOT protect against an Anthropic-wide
// outage, a network failure, or an invalid key — those are shared across
// every entry in the chain.
export const PRIMARY_MODEL = process.env.ANTHROPIC_MODEL_PRIMARY || "claude-sonnet-4-6";
export const FALLBACK_MODEL = process.env.ANTHROPIC_MODEL_FALLBACK || "claude-haiku-4-5-20251001";
export const MODEL_CHAIN: readonly string[] = [PRIMARY_MODEL, FALLBACK_MODEL];

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Copy .env.local.example to .env.local and add your key."
      );
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

/**
 * Raised when an LLM call fails Zod validation twice on the same model, or
 * when the entire model chain is exhausted by model-specific failures.
 * Callers should treat this as "escalate to human review" — never let it
 * crash the server.
 */
export class LLMValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LLMValidationError";
  }
}

interface CallOptions<T> {
  system: string;
  user: string;
  schema: z.ZodType<T>;
}

export interface LLMCallResult<T> {
  data: T;
  modelUsed: string;
  fallbackOccurred: boolean;
}

// Pulls the first top-level JSON object/array out of a response, tolerating
// stray prose or markdown code fences the model might add despite instructions.
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[{[]/);
  if (start === -1) return candidate.trim();
  return candidate.slice(start).trim();
}

async function callOnce(model: string, system: string, user: string): Promise<string> {
  const anthropic = getClient();
  const response = await anthropic.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    system,
    messages: [{ role: "user", content: user }],
  });
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("LLM response contained no text block");
  }
  return textBlock.text;
}

function getErrorStatus(err: unknown): number | undefined {
  return (err as { status?: number } | undefined)?.status;
}

/**
 * True only for errors where trying a different Claude model is a sensible
 * response: 529 (overloaded), 503 (unavailable), 404 (model not found or
 * not enabled), 429 (rate limited — backed off once first, see below).
 * Everything else — 400, 401, 403, network errors, anything unrecognized —
 * returns false and must be rethrown immediately: it would fail identically
 * on any model, so retrying only adds latency to a certain failure.
 */
function isModelSpecificFailure(err: unknown): boolean {
  const status = getErrorStatus(err);
  return status === 529 || status === 503 || status === 404 || status === 429;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calls the LLM and validates its JSON response against `schema`, walking
 * MODEL_CHAIN on model-specific failures (see isModelSpecificFailure).
 *
 * Structure: an outer chain loop selects a model; an inner loop does that
 * model's one validation retry (schema/JSON failure → retry once on the
 * SAME model with the error appended — this NEVER advances the chain,
 * because a validation failure means the prompt or schema needs work, and
 * switching models would conceal a real defect behind a probabilistic
 * workaround). Only a model-specific API failure advances the chain.
 *
 * On a 429, backs off 1s once on the same model before treating a second
 * consecutive 429 as chain-advancing. On success, reports which model
 * actually served the call so callers can degrade confidence accordingly.
 */
export async function callLLMWithValidation<T>({
  system,
  user,
  schema,
}: CallOptions<T>): Promise<LLMCallResult<T>> {
  let lastError = "";

  for (let chainIndex = 0; chainIndex < MODEL_CHAIN.length; chainIndex++) {
    const model = MODEL_CHAIN[chainIndex];
    const fallbackOccurred = chainIndex > 0;
    let backedOff429 = false;
    let advanceChain = false;
    let attempt = 0;

    while (attempt < 2) {
      const prompt =
        attempt === 0
          ? user
          : `${user}\n\nYour previous response failed schema validation with this error:\n${lastError}\n\nRespond again with ONLY valid JSON that satisfies the required schema. Do not include commentary or markdown formatting.`;

      let raw: string;
      try {
        raw = await callOnce(model, system, prompt);
      } catch (err) {
        if (!isModelSpecificFailure(err)) {
          throw err; // 400/401/403/network/unknown — fail immediately, no retry, no fallback
        }
        const status = getErrorStatus(err);
        if (status === 429 && !backedOff429) {
          backedOff429 = true;
          await sleep(1000);
          continue; // retry the same attempt, same model — does not burn the validation-retry budget
        }
        // 529 / 503 / 404, or a second consecutive 429 -> advance the chain.
        lastError = err instanceof Error ? err.message : String(err);
        advanceChain = true;
        break;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(extractJson(raw));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        lastError = `JSON.parse failed: ${msg}. Raw response: ${raw.slice(0, 500)}`;
        attempt++;
        continue;
      }

      const result = schema.safeParse(parsed);
      if (result.success) {
        return { data: result.data, modelUsed: model, fallbackOccurred };
      }
      lastError = result.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      attempt++;
    }

    if (!advanceChain) {
      // Exhausted the validation retry on this model without a model-specific
      // API failure occurring. Per policy this NEVER advances the chain.
      break;
    }
    // else: model-specific failure -> outer loop tries the next model, if any.
  }

  throw new LLMValidationError(
    `LLM output failed validation after exhausting the model chain: ${lastError}`
  );
}
