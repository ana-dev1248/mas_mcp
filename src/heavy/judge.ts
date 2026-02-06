import type { AgentResult, JudgeResult } from "./types.js";

function clampScore(value: number): number {
  return Math.max(0, Math.min(10, value));
}

export function judgeCandidates(results: AgentResult[]): JudgeResult {
  const scores = results.map((result) => {
    const accuracy = clampScore(result.confidence * 10);
    const executability = clampScore(
      result.patch.trim().length > 0 ? 8 : 4
    );
    const risk = clampScore(10 - Math.min(result.risks.length / 40, 10));
    const testability = clampScore(
      result.test_plan.trim().length > 0 ? 8 : 3
    );
    return { accuracy, executability, risk, testability };
  });

  const totals = scores.map(
    (score) =>
      score.accuracy + score.executability + score.risk + score.testability
  );
  const bestIndex = totals.reduce(
    (best, current, index) => (current > totals[best] ? index : best),
    0
  );

  return {
    scores,
    bestIndex,
    rationale: `Selected candidate ${bestIndex} based on highest total score.`,
    improvements:
      "Improve patch clarity, ensure test plan commands are executable, and reduce risk exposure by adding rollback steps."
  };
}
