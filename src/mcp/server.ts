import { createInterface } from "node:readline";
import { stdout } from "node:process";
import { HeavyReviewInputSchema, HeavyVibeInputSchema } from "../heavy/types.js";
import { runHeavy } from "../heavy/orchestrator.js";
import { reviewPatch } from "../heavy/review.js";

const TOOL_DEFS = [
  {
    name: "heavy_vibe",
    description: "Run Real MAS heavy engine with parallel agents.",
    inputSchema: HeavyVibeInputSchema
  },
  {
    name: "heavy_review",
    description: "Review a patch or diff for risks.",
    inputSchema: HeavyReviewInputSchema
  }
];

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: unknown;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
};

function sendResponse(response: JsonRpcResponse): void {
  const payload = JSON.stringify(response);
  const header = `Content-Length: ${Buffer.byteLength(payload, "utf8")}\r\n\r\n`;
  stdout.write(header + payload);
}

function parseContentLength(buffer: Buffer): { length: number; headerLength: number } | null {
  const headerEnd = buffer.indexOf("\r\n\r\n");
  if (headerEnd === -1) {
    return null;
  }
  const header = buffer.slice(0, headerEnd).toString("utf8");
  const match = header.match(/Content-Length: (\d+)/i);
  if (!match) {
    return null;
  }
  return { length: Number(match[1]), headerLength: headerEnd + 4 };
}

export function startServer(): void {
  let buffer = Buffer.alloc(0);
  const rl = createInterface({ input: process.stdin });
  rl.on("line", (line) => {
    buffer = Buffer.concat([buffer, Buffer.from(line + "\n", "utf8")]);
    while (true) {
      const headerInfo = parseContentLength(buffer);
      if (!headerInfo) {
        break;
      }
      const { length, headerLength } = headerInfo;
      if (buffer.length < headerLength + length) {
        break;
      }
      const body = buffer.slice(headerLength, headerLength + length).toString("utf8");
      buffer = buffer.slice(headerLength + length);
      try {
        const message = JSON.parse(body) as JsonRpcRequest;
        handleRequest(message).catch((error) => {
          sendResponse({
            jsonrpc: "2.0",
            id: message.id ?? null,
            error: { code: -32000, message: String(error) }
          });
        });
      } catch (error) {
        sendResponse({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Parse error" }
        });
      }
    }
  });
}

async function handleRequest(request: JsonRpcRequest): Promise<void> {
  if (request.method === "initialize") {
    sendResponse({
      jsonrpc: "2.0",
      id: request.id ?? null,
      result: {
        protocolVersion: "2024-11-05",
        serverInfo: { name: "mas-heavy", version: "0.1.0" },
        capabilities: { tools: {} }
      }
    });
    return;
  }
  if (request.method === "tools/list") {
    sendResponse({
      jsonrpc: "2.0",
      id: request.id ?? null,
      result: {
        tools: TOOL_DEFS.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        }))
      }
    });
    return;
  }
  if (request.method === "tools/call") {
    const params = request.params as { name: string; arguments: unknown };
    if (!params?.name) {
      sendResponse({
        jsonrpc: "2.0",
        id: request.id ?? null,
        error: { code: -32602, message: "Invalid params" }
      });
      return;
    }
    if (params.name === "heavy_vibe") {
      const input = HeavyVibeInputSchema.parse(params.arguments);
      const result = await runHeavy(input);
      sendResponse({
        jsonrpc: "2.0",
        id: request.id ?? null,
        result
      });
      return;
    }
    if (params.name === "heavy_review") {
      const input = HeavyReviewInputSchema.parse(params.arguments);
      const result = reviewPatch(input.patchOrDiff, input.criteria);
      sendResponse({
        jsonrpc: "2.0",
        id: request.id ?? null,
        result
      });
      return;
    }
    sendResponse({
      jsonrpc: "2.0",
      id: request.id ?? null,
      error: { code: -32601, message: "Method not found" }
    });
    return;
  }
  sendResponse({
    jsonrpc: "2.0",
    id: request.id ?? null,
    error: { code: -32601, message: "Method not found" }
  });
}
