import { describe, expect, it } from "vitest";
import { runHeavy } from "../src/heavy/orchestrator.js";
import type { LLMAdapter } from "../src/heavy/adapter.js";
import type { AgentRequest } from "../src/heavy/types.js";

const validJson = JSON.stringify({
  plan: "Plan",
  patch: "diff --git a/file b/file\n@@\n+change",
  test_plan: "echo test",
  risks: "Low",
  assumptions: "None",
  confidence: 0.7
});

type SequenceItem =
  | { type: "ok"; content: string }
  | { type: "error"; error: Error & { status?: number } };

function makeSequenceAdapter(sequence: SequenceItem[], provider = "openai", model = "mock"): LLMAdapter {
  let index = 0;
  return {
    provider,
    model,
    async complete() {
      const current = sequence[Math.min(index, sequence.length - 1)];
      index += 1;
      if (current.type === "error") {
        throw current.error;
      }
      return { content: current.content, latencyMs: 1 };
    }
  };
}

function makeAdapterFactory(map: Record<string, SequenceItem[]>): (agent: AgentRequest) => LLMAdapter {
  const counters: Record<string, number> = {};
  return (agent) => {
    const id = agent.id ?? agent.role;
    counters[id] = counters[id] ?? 0;
    const sequence = map[id] ?? [{ type: "ok", content: validJson }];
    return makeSequenceAdapter(sequence, agent.provider, agent.model);
  };
}

function buildAgents(n: number): AgentRequest[] {
  return Array.from({ length: n }).map((_, index) => ({
    id: `agent-${index + 1}`,
    role: `role-${index + 1}`,
    provider: "openai",
    model: "mock",
    temperature: 0.2
  }));
}

describe("runHeavy", () => {
  it("runs with nAgents=4", async () => {
    const agents = buildAgents(4);
    const result = await runHeavy({
      prompt: "Test",
      nAgents: 4,
      agents,
      trace: false,
      adapterFactory: makeAdapterFactory({})
    });

    expect(result.agents).toHaveLength(4);
    expect(result.final.patch).toContain("diff --git");
  });

  it("runs with nAgents=12", async () => {
    const agents = buildAgents(12);
    const result = await runHeavy({
      prompt: "Test",
      nAgents: 12,
      agents,
      trace: false,
      adapterFactory: makeAdapterFactory({})
    });

    expect(result.agents).toHaveLength(12);
  });

  it("retries on 429 and succeeds", async () => {
    const agents = buildAgents(4);
    const error = new Error("Too Many Requests") as Error & { status?: number };
    error.status = 429;
    const adapterFactory = makeAdapterFactory({
      "agent-1": [
        { type: "error", error },
        { type: "error", error },
        { type: "ok", content: validJson }
      ]
    });

    const result = await runHeavy({
      prompt: "Retry",
      nAgents: 4,
      agents,
      trace: false,
      adapterFactory
    });

    expect(result.final.plan).toContain("Plan");
  });

  it("retries on timeout and succeeds", async () => {
    const agents = buildAgents(4);
    const timeoutError = new Error("Timeout") as Error & { status?: number };
    timeoutError.name = "AbortError";
    const adapterFactory = makeAdapterFactory({
      "agent-2": [
        { type: "error", error: timeoutError },
        { type: "ok", content: validJson }
      ]
    });

    const result = await runHeavy({
      prompt: "Timeout",
      nAgents: 4,
      agents,
      trace: false,
      adapterFactory
    });

    expect(result.final.plan).toContain("Plan");
  });

  it("re-requests on invalid JSON", async () => {
    const agents = buildAgents(4);
    const adapterFactory = makeAdapterFactory({
      "agent-3": [
        { type: "ok", content: "not-json" },
        { type: "ok", content: validJson }
      ]
    });

    const result = await runHeavy({
      prompt: "Invalid JSON",
      nAgents: 4,
      agents,
      trace: false,
      adapterFactory
    });

    expect(result.final.plan).toContain("Plan");
  });

  it("continues with partial failures", async () => {
    const agents = buildAgents(4);
    const fatalError = new Error("Fatal") as Error & { status?: number };
    fatalError.status = 400;
    const adapterFactory = makeAdapterFactory({
      "agent-4": [{ type: "error", error: fatalError }]
    });

    const result = await runHeavy({
      prompt: "Partial",
      nAgents: 4,
      agents,
      trace: false,
      adapterFactory
    });

    expect(result.agents[3].summary).toContain("Fatal");
    expect(result.final.plan).toContain("Plan");
  });
});
