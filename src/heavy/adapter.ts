import type { RetryOptions } from "./retry.js";
import { retryWithBackoff } from "./retry.js";

export type LLMMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LLMResponse = {
  content: string;
  latencyMs: number;
};

export type LLMAdapter = {
  provider: string;
  model: string;
  complete(messages: LLMMessage[], temperature?: number): Promise<LLMResponse>;
};

const DEFAULT_RETRY: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 5000
};

type OpenAIAdapterOptions = {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  retry?: RetryOptions;
};

export function createOpenAIAdapter(options: OpenAIAdapterOptions): LLMAdapter {
  const retryOptions = options.retry ?? DEFAULT_RETRY;
  return {
    provider: "openai",
    model: options.model,
    async complete(messages: LLMMessage[], temperature = 0.2) {
      const startedAt = Date.now();
      const response = await retryWithBackoff(async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
        try {
          const res = await fetch(`${options.baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${options.apiKey}`
            },
            body: JSON.stringify({
              model: options.model,
              messages,
              temperature,
              response_format: { type: "json_object" }
            }),
            signal: controller.signal
          });
          if (!res.ok) {
            const error = new Error(`OpenAI error: ${res.status}`) as Error & {
              status?: number;
            };
            error.status = res.status;
            throw error;
          }
          const data = (await res.json()) as {
            choices: Array<{ message: { content: string } }>;
          };
          return data.choices[0]?.message?.content ?? "";
        } finally {
          clearTimeout(timeout);
        }
      }, retryOptions);
      return { content: response, latencyMs: Date.now() - startedAt };
    }
  };
}
