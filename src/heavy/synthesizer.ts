import type { AgentResult, FinalResult, JudgeResult } from "./types.js";

export function synthesizeFinal(
  best: AgentResult,
  judge: JudgeResult
): FinalResult {
  return {
    plan: `${best.plan}\n\nImprovements: ${judge.improvements}`,
    patch: best.patch,
    test_plan: best.test_plan,
    risks: best.risks,
    rollback: "Revert the applied patch or checkout the previous commit.",
    confidence: best.confidence
  };
}
