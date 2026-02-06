import type { AgentRequest } from "./types.js";

const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

const baseAgents: Record<string, AgentRequest[]> = {
  balanced: [
    { role: "planner", provider: "openai", model: DEFAULT_MODEL, temperature: 0.2 },
    { role: "implementer", provider: "openai", model: DEFAULT_MODEL, temperature: 0.4 },
    { role: "tester", provider: "openai", model: DEFAULT_MODEL, temperature: 0.3 },
    { role: "reviewer", provider: "openai", model: DEFAULT_MODEL, temperature: 0.1 }
  ],
  quality: [
    { role: "architect", provider: "openai", model: DEFAULT_MODEL, temperature: 0.2 },
    { role: "refiner", provider: "openai", model: DEFAULT_MODEL, temperature: 0.2 },
    { role: "risk-analyst", provider: "openai", model: DEFAULT_MODEL, temperature: 0.1 },
    { role: "tester", provider: "openai", model: DEFAULT_MODEL, temperature: 0.3 }
  ],
  speed: [
    { role: "fast-planner", provider: "openai", model: DEFAULT_MODEL, temperature: 0.5 },
    { role: "implementer", provider: "openai", model: DEFAULT_MODEL, temperature: 0.6 },
    { role: "summarizer", provider: "openai", model: DEFAULT_MODEL, temperature: 0.5 },
    { role: "tester", provider: "openai", model: DEFAULT_MODEL, temperature: 0.4 }
  ],
  security: [
    { role: "threat-modeler", provider: "openai", model: DEFAULT_MODEL, temperature: 0.1 },
    { role: "security-reviewer", provider: "openai", model: DEFAULT_MODEL, temperature: 0.1 },
    { role: "implementer", provider: "openai", model: DEFAULT_MODEL, temperature: 0.2 },
    { role: "tester", provider: "openai", model: DEFAULT_MODEL, temperature: 0.2 }
  ]
};

export function buildAgents(
  preset: "balanced" | "quality" | "speed" | "security",
  nAgents: number
): AgentRequest[] {
  const base = baseAgents[preset];
  const agents: AgentRequest[] = [];
  for (let index = 0; index < nAgents; index += 1) {
    const template = base[index % base.length];
    agents.push({
      ...template,
      id: `${preset}-${index + 1}`
    });
  }
  return agents;
}
