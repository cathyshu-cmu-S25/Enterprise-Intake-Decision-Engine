import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

export const MODEL = "claude-sonnet-4-6";
export const MAX_TOKENS = 1500;
export const TEMPERATURE = 0.2;

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
 * Raised when an LLM call fails Zod validation twice in a row. Callers
 * should treat this as "escalate to human review" — never let it crash
 * the server.
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

// Pulls the first top-level JSON object/array out of a response, tolerating
// stray prose or markdown code fences the model might add despite instructions.
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[{[]/);
  if (start === -1) return candidate.trim();
  return candidate.slice(start).trim();
}

async function callOnce(system: string, user: string): Promise<string> {
  const anthropic = getClient();
  const response = await anthropic.messages.create({
    model: MODEL,
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

/**
 * Calls the LLM and validates its JSON response against `schema`. On
 * validation (or parse) failure, retries ONCE with the error appended to
 * the prompt. On a second failure, throws LLMValidationError so the caller
 * can surface a clean "escalated to human review" event instead of crashing.
 */
export async function callLLMWithValidation<T>({
  system,
  user,
  schema,
}: CallOptions<T>): Promise<T> {
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt =
      attempt === 0
        ? user
        : `${user}\n\nYour previous response failed schema validation with this error:\n${lastError}\n\nRespond again with ONLY valid JSON that satisfies the required schema. Do not include commentary or markdown formatting.`;

    let raw: string;
    try {
      raw = await callOnce(system, prompt);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJson(raw));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastError = `JSON.parse failed: ${msg}. Raw response: ${raw.slice(0, 500)}`;
      continue;
    }

    const result = schema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
    lastError = result.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
  }

  throw new LLMValidationError(
    `LLM output failed validation after 2 attempts: ${lastError}`
  );
}
