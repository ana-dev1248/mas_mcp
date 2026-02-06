import pLimit from "p-limit";
import { randomUUID } from "node:crypto";
import { AgentResultSchema, HeavyVibeInputSchema } from "./types.js";
import type {
  AgentRequest,
  AgentResult,
  HeavyFinal,
  HeavyVibeInput
} from "./types.js";
import { buildAgents } from "./presets.js";
import { createOpenAIAdapter } from "./adapter.js";
import type { LLMAdapter, LLMMessage } from "./adapter.js";
import { retryWithBackoff } from "./retry.js";
import { judgeCandidates } from "./judge.js";
import { synthesizeFinal } from "./synthesizer.js";
import { redactSecrets, writeTrace } from "./trace.js";

const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_MAX_IN_FLIGHT = 2;
const DEFAULT_INVALID_JSON_RETRIES = 2;

export type RunHeavyOptions = HeavyVibeInput & {
  adapterFactory?: (agent: AgentRequest, timeoutMs: number) => LLMAdapter;
};

type AgentRunResult = {
  agent: AgentRequest & { id: string };
  result?: AgentResult;
  error?: string;
  latencyMs: number;
};

function ensureAgentIds(agents: AgentRequest[]): Array<AgentRequest & { id: string }> {
  return agents.map((agent, index) => ({
    ...agent,
    id: agent.id ?? `agent-${index + 1}`
  }));
}

function validateAgents(nAgents: number, agents?: AgentRequest[]): AgentRequest[] | undefined {
  if (nAgents < 4 || nAgents > 12) {
    throw new Error("nAgents must be between 4 and 12.");
  }
  if (agents && agents.length !== nAgents) {
    throw new Error("agents length must match nAgents.");
  }
  return agents;
}

function buildSystemPrompt(role: string): string {
  return [
    "You are an autonomous agent in a multi-agent system.",
    `Role: ${role}.`,
    "Return a strict JSON object with keys: plan, patch, test_plan, risks, assumptions, confidence.",
    "confidence must be 0..1.",
    "patch must be a unified diff.",
    "test_plan should be runnable commands with expected results."
  ].join(" ");
}

async function callAgent(
  adapter: LLMAdapter,
  agent: AgentRequest & { id: string },
  prompt: string,
  repoContext: string | undefined,
  timeoutMs: number
): Promise<AgentRunResult> {
  const startedAt = Date.now();
  const messages: LLMMessage[] = [
    { role: "system", content: buildSystemPrompt(agent.role) },
    {
      role: "user",
      content: [prompt, repoContext ? `Repo context:\n${repoContext}` : ""]
        .filter(Boolean)
        .join("\n\n")
    }
  ];

  let attempt = 0;
  while (attempt <= DEFAULT_INVALID_JSON_RETRIES) {
    const response = await retryWithBackoff(
      () => adapter.complete(messages, agent.temperature),
      { maxRetries: 3, baseDelayMs: 500, maxDelayMs: 5000 }
    );
    const content = response.content.trim();
    try {
      const parsed = AgentResultSchema.parse(JSON.parse(content));
      return {
        agent,
        result: parsed,
        latencyMs: Date.now() - startedAt
      };
    } catch (error) {
      if (attempt === DEFAULT_INVALID_JSON_RETRIES) {
        return {
          agent,
          error: `Invalid JSON response after ${attempt + 1} attempts: ${String(
            error
          )}`,
          latencyMs: Date.now() - startedAt
        };
      }
      messages.push({
        role: "assistant",
        content
      });
      messages.push({
        role: "user",
        content:
          "Your previous response was invalid JSON. Return ONLY a valid JSON object matching the schema."
      });
    }
    attempt += 1;
  }

  return {
    agent,
    error: "Unknown error",
    latencyMs: Date.now() - startedAt
  };
}

export async function runHeavy(rawInput: HeavyVibeInput): Promise<HeavyFinal> {
  const input = HeavyVibeInputSchema.parse(rawInput);
  const agentsConfig = validateAgents(input.nAgents, input.agents);
  const preset = input.preset ?? "balanced";
  const agents = ensureAgentIds(
    agentsConfig ?? buildAgents(preset, input.nAgents)
  );
  const maxInFlight = input.maxInFlightPerProvider ?? DEFAULT_MAX_IN_FLIGHT;
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const traceId = randomUUID();

  const providerLimits = new Map<string, ReturnType<typeof pLimit>>();

  const adapterFactory = input.adapterFactory ?? ((agent: AgentRequest) => {
    const apiKey = process.env.OPENAI_API_KEY ?? "";
    const baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is required for OpenAI adapter.");
    }
    return createOpenAIAdapter({
      apiKey,
      baseUrl,
      model: agent.model,
      timeoutMs
    });
  });

  const tasks = agents.map((agent) => {
    if (!providerLimits.has(agent.provider)) {
      providerLimits.set(agent.provider, pLimit(maxInFlight));
    }
    const limit = providerLimits.get(agent.provider) ?? pLimit(maxInFlight);
    return limit(() =>
      callAgent(adapterFactory(agent, timeoutMs), agent, input.prompt, input.repoContext, timeoutMs)
    );
  });

  const settled = await Promise.allSettled(tasks);
  const runs: AgentRunResult[] = settled.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;
    }
    const agent = agents[index];
    return {
      agent,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      latencyMs: 0
    };
  });

  const successful = runs.filter((run) => run.result) as Array<AgentRunResult & { result: AgentResult }>;
  if (successful.length === 0) {
    throw new Error("All agents failed. See trace for details.");
  }
  const results = successful.map((run) => run.result);
  const judge = judgeCandidates(results);
  const best = results[judge.bestIndex] ?? results[0];
  const final = synthesizeFinal(best, judge);

  const trace = {
    traceId,
    startedAt: new Date().toISOString(),
    prompt: input.prompt,
    opts: redactSecrets({
      nAgents: input.nAgents,
      preset,
      maxInFlight,
      timeoutMs
    }),
    agents: runs.map((run) => ({
      id: run.agent.id,
      role: run.agent.role,
      provider: run.agent.provider,
      model: run.agent.model,
      latencyMs: run.latencyMs,
      status: run.result ? "ok" : "error",
      error: run.error,
      summary: run.result
        ? run.result.plan.slice(0, 200)
        : undefined
    })),
    judge,
    final
  };

  if (input.trace !== false) {
    await writeTrace(trace);
  }

  return {
    final,
    agents: runs.map((run) => ({
      id: run.agent.id,
      role: run.agent.role,
      provider: run.agent.provider,
      model: run.agent.model,
      latencyMs: run.latencyMs,
      summary: run.result
        ? run.result.plan.slice(0, 200)
        : run.error ?? "unknown error"
    })),
    judge,
    traceId
  };
}
