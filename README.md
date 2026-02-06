# MAS_Cline — Real MAS (Heavy Engine)

This repository implements **Real MAS (Heavy Engine)**: a single MCP tool call that triggers **4–12 real, parallel LLM API calls**, performs cross-evaluation, and returns a synthesized patch/test plan for vibe coding.

## Requirements

- Node.js 20+
- pnpm
- OpenAI-compatible Chat Completions endpoint

## Install

```bash
pnpm install
pnpm build
```

## Environment

Create a `.env` from `.env.example`:

```bash
cp .env.example .env
```

Required:

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL` (default: https://api.openai.com/v1)
- `OPENAI_MODEL` (default: gpt-4o-mini)

## Start MCP Server

```bash
pnpm build
pnpm start
```

The server listens on **stdio** (MCP JSON-RPC with `Content-Length` headers).

## Cline MCP configuration example

```json
{
  "mcpServers": {
    "mas-heavy": {
      "command": "node",
      "args": ["/path/to/MAS_Cline/dist/index.js"],
      "env": {
        "OPENAI_API_KEY": "${OPENAI_API_KEY}",
        "OPENAI_BASE_URL": "https://api.openai.com/v1",
        "OPENAI_MODEL": "gpt-4o-mini"
      }
    }
  }
}
```

## Tools

### `heavy_vibe`

**Input**:

```json
{
  "prompt": "...",
  "nAgents": 4,
  "preset": "balanced",
  "agents": [
    { "role": "planner", "provider": "openai", "model": "gpt-4o-mini", "temperature": 0.2 }
  ],
  "repoContext": "optional context",
  "maxInFlightPerProvider": 2,
  "timeoutMs": 60000,
  "trace": true
}
```

- `nAgents` must be **4–12** (otherwise error).
- Use `agents` to explicitly set role/provider/model/temperature.
- Otherwise, `preset` is used (balanced/quality/speed/security).

**Output (short example)**:

```json
{
  "final": {
    "plan": "...",
    "patch": "diff --git ...",
    "test_plan": "pnpm test",
    "risks": "...",
    "rollback": "...",
    "confidence": 0.72
  },
  "agents": [
    { "id": "balanced-1", "role": "planner", "provider": "openai", "model": "gpt-4o-mini", "latencyMs": 1200, "summary": "..." }
  ],
  "judge": {
    "scores": [{ "accuracy": 7, "executability": 8, "risk": 6, "testability": 8 }],
    "bestIndex": 0,
    "rationale": "...",
    "improvements": "..."
  },
  "traceId": "uuid"
}
```

### `heavy_review`

**Input**:

```json
{
  "patchOrDiff": "diff --git ...",
  "criteria": ["security", "testability"]
}
```

**Output**:

```json
{
  "findings": ["..."],
  "risk": "low",
  "recommendations": ["..."]
}
```

## Tracing

Each `heavy_vibe` call writes `.mas/traces/<traceId>.json` with agent results, judge scores, and final synthesis (secrets are masked).

## Testing

```bash
pnpm test
```

Tests include:

- `nAgents=4` and `nAgents=12`
- 429 retry
- timeout retry
- invalid JSON re-request
- partial failure handling
