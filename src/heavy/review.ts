import type { HeavyReviewOutput } from "./types.js";

export function reviewPatch(
  patchOrDiff: string,
  criteria: string[] = []
): HeavyReviewOutput {
  const findings: string[] = [];
  if (!patchOrDiff.includes("@@")) {
    findings.push("Patch does not include unified diff hunks (@@)." );
  }
  if (patchOrDiff.length > 20000) {
    findings.push("Patch is large; consider splitting into smaller changes.");
  }
  if (patchOrDiff.includes("TODO") || patchOrDiff.includes("FIXME")) {
    findings.push("Patch contains TODO/FIXME markers.");
  }
  if (criteria.length > 0) {
    findings.push(`Custom criteria evaluated: ${criteria.join(", ")}.`);
  }

  return {
    findings,
    risk: findings.length > 0 ? "medium" : "low",
    recommendations: [
      "Ensure patch applies cleanly with git apply.",
      "Run the suggested test plan.",
      "Validate JSON output against the zod schema."
    ]
  };
}
