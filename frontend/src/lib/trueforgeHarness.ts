/**
 * trueforgeHarness.ts
 * TrueForge (TrueFoundry) agent harness integration for KAI Nuvari.
 *
 * TrueForge is an open-source agent runtime that wraps the execution loop:
 * model calls, MCP tools, context management, sandboxing, human approval
 * checkpoints, and session state.
 *
 * API model (TrueForge SDK v0.1.x):
 *   client.sessions.create({ agent: { spec } })               → GetSessionResponse
 *   client.sessions.createTurn(sessionId, { input })          → GetTurnResponse
 *   client.sessions.createTurnStream(sessionId, { input })    → Stream<TurnStreamingEvent>
 *
 * Run the harness locally:  npx @truefoundry/trueforge
 * Default port:             http://localhost:3001
 *
 * Docs: https://www.truefoundry.com/docs/agent-platform/agent-harness/overview
 */

import { TrueForge, TrueForgeApi } from '@truefoundry/trueforge-sdk';

// ── Config ────────────────────────────────────────────────────────────────────

const TRUEFORGE_URL =
  process.env.NEXT_PUBLIC_TRUEFORGE_URL ?? 'http://localhost:3001';

const TRUEFORGE_API_KEY =
  process.env.TRUEFORGE_API_KEY ?? '';

// ── Client singleton ──────────────────────────────────────────────────────────

let _client: TrueForge | null = null;

export function getTrueForgeClient(): TrueForge {
  if (!_client) {
    _client = new TrueForge({
      baseUrl: TRUEFORGE_URL,
      ...(TRUEFORGE_API_KEY ? { apiKey: TRUEFORGE_API_KEY } : {}),
    });
  }
  return _client;
}

// ── Agent spec (KAI Nuvari) ───────────────────────────────────────────────────

function buildKaiAgentSpec(
  hederaAccountId?: string,
  modelName = 'groq/llama-3.1-8b-instant',
): TrueForgeApi.AgentSpec {
  return {
    model: { name: modelName } as TrueForgeApi.Model,
    instructions: [
      'You are KAI — an AI-native DeFi and conservation finance assistant on Hedera and Ethereum.',
      'You have access to Hedera tools (HTS tokens, NFTs, HCS audit log) and DeFi tools (vaults, pools, x402 payments).',
      'Always confirm before minting tokens or NFTs.',
      'Log all significant actions to HCS for auditability.',
      hederaAccountId ? `The user's Hedera account is: ${hederaAccountId}` : '',
    ].filter(Boolean).join('\n'),
    mcpServers: [],
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TrueForgeRunOptions {
  task:             string;
  sessionId?:       string;
  hederaAccountId?: string;
  model?:           string;
}

export interface TrueForgeResult {
  sessionId: string;
  turnId:    string;
  status:    string;
  output:    string;
}

export interface TrueForgeStreamChunk {
  type:     string;
  token?:   string;
  tool?:    string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args?:    any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result?:  any;
  done?:    boolean;
  error?:   string;
  sessionId?: string;
}

// ── Session management ────────────────────────────────────────────────────────

/**
 * Create a TrueForge session for a KAI agent interaction.
 * Returns the session ID.
 */
export async function createKaiSession(
  options: Pick<TrueForgeRunOptions, 'hederaAccountId' | 'model'> = {},
): Promise<string> {
  const client = getTrueForgeClient();
  const spec   = buildKaiAgentSpec(options.hederaAccountId, options.model);

  const response = await client.sessions.create({
    agent: { spec } as TrueForgeApi.CreateSessionAgent,
  });

  // GetSessionResponse.data is the Session object
  return response.data.id;
}

// ── Task execution ────────────────────────────────────────────────────────────

/**
 * Run a task through TrueForge (non-streaming).
 * Creates a session if none provided, executes a turn, returns result.
 */
export async function runTrueForgeTask(
  options: TrueForgeRunOptions,
): Promise<TrueForgeResult> {
  const client = getTrueForgeClient();

  try {
    const sessionId = options.sessionId ?? await createKaiSession({
      hederaAccountId: options.hederaAccountId,
      model:           options.model,
    });

    const turnResp = await client.sessions.createTurn(sessionId, {
      input: [{
        type:    'user.message' as const,
        content: options.task,
      }],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const turnData = turnResp.data as any;
    const output   = turnData?.state?.output
      ? (typeof turnData.state.output === 'string'
          ? turnData.state.output
          : JSON.stringify(turnData.state.output))
      : '';

    return {
      sessionId,
      turnId: turnData?.id ?? '',
      status: turnData?.state?.status ?? 'running',
      output,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'TrueForge unavailable';
    return {
      sessionId: options.sessionId ?? '',
      turnId:    '',
      status:    'error',
      output:    `TrueForge harness error: ${message}. Is the server running? (npx @truefoundry/trueforge)`,
    };
  }
}

/**
 * Stream a TrueForge agent turn via SSE.
 * Wire directly into a Next.js streaming API route.
 */
export async function* streamTrueForgeTask(
  options: TrueForgeRunOptions,
): AsyncGenerator<string> {
  const client = getTrueForgeClient();

  try {
    const sessionId = options.sessionId ?? await createKaiSession({
      hederaAccountId: options.hederaAccountId,
      model:           options.model,
    });

    yield `data: ${JSON.stringify({ session_id: sessionId })}\n\n`;

    const stream = await client.sessions.createTurnStream(sessionId, {
      input: [{
        type:    'user.message' as const,
        content: options.task,
      }],
    });

    for await (const event of stream) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ev = event as any;
      const type = ev?.type ?? 'unknown';

      if (type === 'model.message' || type === 'model.message.delta') {
        const content = ev?.content ?? ev?.delta?.content ?? '';
        yield `data: ${JSON.stringify({ token: content })}\n\n`;
      } else if (type === 'tool.call') {
        yield `data: ${JSON.stringify({ tool: ev?.name, args: ev?.arguments })}\n\n`;
      } else if (type === 'tool.result') {
        yield `data: ${JSON.stringify({ tool_result: ev?.content })}\n\n`;
      } else if (type === 'turn.done') {
        yield `data: ${JSON.stringify({ done: true, session_id: sessionId })}\n\n`;
        return;
      }
    }

    yield `data: ${JSON.stringify({ done: true })}\n\n`;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'TrueForge error';
    yield `data: ${JSON.stringify({ token: `Error: ${message}` })}\n\n`;
    yield `data: ${JSON.stringify({ done: true, error: message })}\n\n`;
  }
}

/**
 * Health check — returns true if the TrueForge server is reachable.
 */
export async function isTrueForgeAvailable(): Promise<boolean> {
  try {
    const client = getTrueForgeClient();
    await client.server.getCapabilities();
    return true;
  } catch {
    return false;
  }
}
