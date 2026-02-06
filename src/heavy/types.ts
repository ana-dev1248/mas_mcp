import { z } from "zod";

export const AgentRequestSchema = z.object({
  role: z.string(),
  provider: z.string(),
  model: z.string(),
  temperature: z.number().min(0).max(2).optional(),
  id: z.string().optional()
});

export type AgentRequest = z.infer<typeof AgentRequestSchema>;

export const AgentResultSchema = z.object({
  plan: z.string(),
  patch: z.string(),
  test_plan: z.string(),
  risks: z.string(),
  assumptions: z.string(),
  confidence: z.number().min(0).max(1)
});

export type AgentResult = z.infer<typeof AgentResultSchema>;

export const FinalResultSchema = z.object({
  plan: z.string(),
  patch: z.string(),
  test_plan: z.string(),
  risks: z.string(),
  rollback: z.string(),
  confidence: z.number().min(0).max(1)
});

export type FinalResult = z.infer<typeof FinalResultSchema>;

export const JudgeSchema = z.object({
  scores: z.array(
    z.object({
      accuracy: z.number().min(0).max(10),
      executability: z.number().min(0).max(10),
      risk: z.number().min(0).max(10),
      testability: z.number().min(0).max(10)
    })
  ),
  bestIndex: z.number().int().nonnegative(),
  rationale: z.string(),
  improvements: z.string()
});

export type JudgeResult = z.infer<typeof JudgeSchema>;

export const HeavyFinalSchema = z.object({
  final: FinalResultSchema,
  agents: z.array(
    z.object({
      id: z.string(),
      role: z.string(),
      provider: z.string(),
      model: z.string(),
      latencyMs: z.number(),
      summary: z.string()
    })
  ),
  judge: JudgeSchema,
  traceId: z.string()
});

export type HeavyFinal = z.infer<typeof HeavyFinalSchema>;

export const HeavyVibeInputSchema = z.object({
  prompt: z.string(),
  nAgents: z.number().int(),
  preset: z.enum(["balanced", "quality", "speed", "security"]).optional(),
  agents: z.array(AgentRequestSchema).optional(),
  repoContext: z.string().optional(),
  maxInFlightPerProvider: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().optional(),
  trace: z.boolean().optional()
});

export type HeavyVibeInput = z.infer<typeof HeavyVibeInputSchema>;

export const HeavyReviewInputSchema = z.object({
  patchOrDiff: z.string(),
  criteria: z.array(z.string()).optional()
});

export type HeavyReviewInput = z.infer<typeof HeavyReviewInputSchema>;

export const HeavyReviewOutputSchema = z.object({
  findings: z.array(z.string()),
  risk: z.string(),
  recommendations: z.array(z.string())
});

export type HeavyReviewOutput = z.infer<typeof HeavyReviewOutputSchema>;
