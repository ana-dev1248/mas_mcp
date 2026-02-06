import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type TraceRecord = {
  traceId: string;
  startedAt: string;
  prompt: string;
  opts: Record<string, unknown>;
  agents: Array<Record<string, unknown>>;
  judge: Record<string, unknown>;
  final: Record<string, unknown>;
};

export async function writeTrace(trace: TraceRecord): Promise<void> {
  const dir = join(process.cwd(), ".mas", "traces");
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, `${trace.traceId}.json`);
  await writeFile(filePath, JSON.stringify(trace, null, 2), "utf-8");
}

export function redactSecrets(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map((item) => redactSecrets(item));
  }
  if (obj && typeof obj === "object") {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key.toLowerCase().includes("key") || key.toLowerCase().includes("token")) {
        redacted[key] = "***";
      } else {
        redacted[key] = redactSecrets(value);
      }
    }
    return redacted;
  }
  return obj;
}
