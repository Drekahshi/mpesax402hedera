'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bot, Send, ChevronLeft, Loader2, RefreshCw,
  Wrench, ChevronRight, X, Database,
  Coins, BarChart3, ShieldCheck, Vote, Leaf,
  BookOpen, Cpu, ChevronDown, ChevronUp, Zap,
} from 'lucide-react';
import Link from 'next/link';
import AgentProposalCard, { AgentProposal } from '@/components/AgentProposalCard';
import { ECOSYSTEM_TOKENS } from '@/lib/tokens';
import { VAULT_ADDRESSES } from '@/lib/addresses';
import { formatChat } from '@/lib/formatChat';
import VoiceButton from '@/components/voice/VoiceButton';

// ── Needle result types ────────────────────────────────────────────────────────
interface NeedleToolResult {
  tool?: string;
  tool_name?: string;
  name?: string;
  args?: Record<string, unknown>;
  arguments?: Record<string, unknown>;
  result?: unknown;
  output?: unknown;
  error?: string;
}

interface Msg {
  role: 'ai' | 'user';
  text: string;
  agent?: string;
  sources?: number;
  proposal?: AgentProposal;
  needleResults?: NeedleToolResult[];
  isNeedle?: boolean;
}

const TOOLS = [
  {
    group: 'Portfolio', icon: Coins, color: '#10b981',
    items: [
      { label: 'Check wallet balances',     q: 'Show all my token balances and total portfolio value in USD' },
      { label: 'Best yield opportunity',    q: 'What is the best yield opportunity in KAI right now?' },
      { label: 'Vault APY comparison',      q: 'Compare all KAI vault APYs and risk levels' },
    ],
  },
  {
    group: 'Liquidity', icon: BarChart3, color: '#3b82f6',
    items: [
      { label: 'Pool reserves & rates',     q: 'Show current KAI AMM pool reserves and swap rates' },
      { label: 'Impermanent loss estimate', q: 'Explain impermanent loss for KAI pools and how to minimise it' },
      { label: 'Add liquidity guide',       q: 'How do I add liquidity to the NVR/yBOB pool step by step?' },
    ],
  },
  {
    group: 'Governance', icon: Vote, color: '#a855f7',
    items: [
      { label: 'Draft DAO proposal',        q: 'Draft a KAI DAO governance proposal to increase GAMI vault APY to 25%' },
      { label: 'Explain NVR voting',        q: 'How does NVR token governance voting work in KAI?' },
      { label: 'Policy recommendation',     q: 'Give me a personalised KAI policy recommendation for medium risk tolerance' },
    ],
  },
  {
    group: 'Security', icon: ShieldCheck, color: '#22c55e',
    items: [
      { label: 'Audit KaiVault contract',   q: 'Audit the KaiVault smart contract for security vulnerabilities' },
      { label: 'DID activity log',          q: 'Show recent agent activity and authorization status from DID tracker' },
      { label: 'x402 payment status',       q: 'What is the current x402 payment rail configuration?' },
    ],
  },
  {
    group: 'Learn', icon: BookOpen, color: '#f59e0b',
    items: [
      { label: 'Start KAI onboarding',      q: 'Guide me through the KAI Nuvari onboarding step by step' },
      { label: 'Explain yield farming',     q: 'Explain yield farming and how KAI vaults work in simple terms' },
      { label: 'Community commodities',     q: 'What community commodities can be tokenized on KAI and at what APY?' },
    ],
  },
  {
    group: 'Cross-Border', icon: Zap, color: '#f59e0b',
    items: [
      { label: 'Busha FX Corridors',        q: 'How does Busha facilitate cross-border settlement between KES, NGN, and ZAR?' },
      { label: 'M-Pesa Daraja Ingress',     q: 'Explain how M-Pesa STK Push deposits credit KAIBAR on Hedera.' },
      { label: 'Cross-Border Remittance',   q: 'Show the step-by-step cross-border remittance flow from M-Pesa to Hedera to Busha payout.' },
    ],
  },
  {
    group: 'Ecosystem', icon: Leaf, color: '#06b6d4',
    items: [
      { label: 'All KAI tokens explained',  q: 'Explain all 6 KAI ecosystem tokens and their roles' },
      { label: 'M-Pesa integration',        q: 'How does the KAI M-Pesa integration work for KES payments?' },
      { label: 'Conservation NFTs',         q: 'Explain the KAI Conservation NFT marketplace and how to buy with yBOB' },
    ],
  },
  {
    group: 'Needle', icon: Cpu, color: '#f472b6',
    needle: true,
    items: [
      { label: 'HBAR balance (live)',        q: 'Get the HBAR balance and all token holdings for account 0.0.5834216' },
      { label: 'Swap HBAR for NVR',          q: 'Swap 50 HBAR for NVR tokens to account 0.0.5834216' },
      { label: 'Mint NVR tokens',            q: 'Mint 1000 NVR tokens to account 0.0.5834216' },
      { label: 'KAIBAR balance',             q: 'What is the KAIBAR balance for account 0.0.5834216?' },
      { label: 'Recent transactions',        q: 'Show the last 10 transactions for account 0.0.5834216' },
      { label: 'HCS audit log',              q: 'Show the latest HCS audit log entries from the conservation topic' },
      { label: 'Hedera rails health',        q: 'Check the Hedera rail configuration and operator status' },
      { label: 'x402 payment info',          q: 'What are the x402 payment route prices and configuration?' },
      { label: 'x402 daily spend',           q: 'What is the agent x402 spend status for today?' },
    ],
  },
];

function detectProposal(query: string): AgentProposal | undefined {
  const q = query.toLowerCase();
  const yBOB = ECOSYSTEM_TOKENS.find(t => t.symbol === 'yBOB');
  if ((q.includes('deposit') || q.includes('vault')) && q.includes('ybob')) {
    return {
      agentName: 'Vault Agent', actionType: 'APPROVE_STAKE',
      title: 'Deposit yBOB into Vault',
      description: 'Deposit yBOB into the kvyBOB yield vault to earn 7.5% APY.',
      amount: '10', tokenSymbol: 'yBOB', tokenAddress: yBOB?.address as `0x${string}`,
      targetContract: VAULT_ADDRESSES.yBOB ?? '0x431A98d42f9F7d6529C676115D5E3Df3c2419DA2',
      projectedApy: '7.5% APY',
    };
  }
  if (q.includes('transfer') && q.includes('ybob')) {
    // Only propose a real transfer when the user actually gave a recipient address —
    // this proposal card executes on-chain as soon as it's approved, with no way to
    // edit the recipient, so it must never fall back to a made-up address.
    const addressMatch = query.match(/0x[a-fA-F0-9]{40}/);
    if (!addressMatch) return undefined;
    return {
      agentName: 'Tx Agent', actionType: 'TRANSFER',
      title: 'Transfer yBOB',
      description: 'Transfer yBOB on Sepolia / Hedera Testnet testnet.',
      amount: '5', tokenSymbol: 'yBOB', tokenAddress: yBOB?.address as `0x${string}`,
      recipientAddress: addressMatch[0] as `0x${string}`,
    };
  }
}

function fmt(text: string) {
  return formatChat(text);
}

// ── Needle Tool Trace Card ──────────────────────────────────────────────────────
function NeedleTraceCard({ results }: { results: NeedleToolResult[] }) {
  const [open, setOpen] = useState(false);
  if (!results?.length) return null;
  const rawFirst = results[0] as Record<string, any>;
  let toolName = rawFirst?.tool || rawFirst?.tool_name || rawFirst?.name;
  if (!toolName) {
    if ('hbar' in rawFirst || 'hbar_balance' in rawFirst || 'tokens' in rawFirst) toolName = 'hedera_account_info';
    else if ('kaibar_token' in rawFirst || 'connft_token' in rawFirst) toolName = 'hedera_rails_health';
    else if ('topic_id' in rawFirst || 'messages' in rawFirst) toolName = 'hedera_hcs_audit_log';
    else if ('transactions' in rawFirst) toolName = 'hedera_transaction_history';
    else if ('daily_spend' in rawFirst || 'usd_today' in rawFirst) toolName = 'x402_spend_status';
    else toolName = 'needle_tool';
  }
  const argsObj = rawFirst?.args || rawFirst?.arguments;
  const resObj = rawFirst?.result !== undefined ? rawFirst.result : (rawFirst?.output !== undefined ? rawFirst.output : rawFirst);
  const hasError = !!rawFirst?.error || !!resObj?.error;

  return (
    <div style={{
      marginTop: 10,
      borderRadius: 12,
      overflow: 'hidden',
      border: `1px solid ${hasError ? 'rgba(248,113,113,0.30)' : 'rgba(244,114,182,0.28)'}`,
      background: hasError ? 'rgba(30,10,10,0.80)' : 'rgba(15,6,18,0.90)',
      fontSize: 12,
    }}>
      {/* Header row */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', background: 'transparent', border: 'none',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <Cpu size={12} color={hasError ? '#f87171' : '#f472b6'} />
        <span style={{ flex: 1, fontWeight: 700, color: hasError ? '#f87171' : '#f9a8d4', fontFamily: 'monospace', fontSize: 11 }}>
          {toolName}()
        </span>
        <span style={{ fontSize: 9, color: hasError ? '#f87171' : 'rgba(244,114,182,0.55)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          {hasError ? 'error' : 'ok'}
        </span>
        <Zap size={9} color={hasError ? '#f87171' : '#f472b6'} style={{ opacity: 0.6 }} />
        {open ? <ChevronUp size={11} color='rgba(255,255,255,0.30)' /> : <ChevronDown size={11} color='rgba(255,255,255,0.30)' />}
      </button>

      {/* Expanded trace */}
      {open && (
        <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {argsObj && Object.keys(argsObj).length > 0 && (
            <div>
              <p style={{ margin: '0 0 4px', fontSize: 9, fontWeight: 700, color: 'rgba(244,114,182,0.55)', textTransform: 'uppercase', letterSpacing: 0.9 }}>Args</p>
              <pre style={{
                margin: 0, padding: '7px 10px', borderRadius: 8,
                background: 'rgba(0,0,0,0.35)', color: '#e9d5ff', fontSize: 10,
                overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                border: '1px solid rgba(244,114,182,0.12)',
              }}>{JSON.stringify(argsObj, null, 2)}</pre>
            </div>
          )}
          <div>
            <p style={{ margin: '0 0 4px', fontSize: 9, fontWeight: 700, color: 'rgba(244,114,182,0.55)', textTransform: 'uppercase', letterSpacing: 0.9 }}>Result</p>
            <pre style={{
              margin: 0, padding: '7px 10px', borderRadius: 8,
              background: 'rgba(0,0,0,0.35)',
              color: hasError ? '#fca5a5' : '#bbf7d0', fontSize: 10,
              overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              border: `1px solid ${hasError ? 'rgba(248,113,113,0.18)' : 'rgba(74,222,128,0.15)'}`,
              maxHeight: 300,
            }}>{JSON.stringify(resObj, null, 2)}</pre>
          </div>
          <p style={{ margin: 0, fontSize: 9, color: 'rgba(255,255,255,0.20)', fontStyle: 'italic' }}>
            needle-2 · cactus-compute · on-device (14 MB)
          </p>
        </div>
      )}
    </div>
  );
}

export default function AIPage() {
  const [msgs, setMsgs] = useState<Msg[]>([{
    role: 'ai',
    text: 'Hello! I\'m **KAI** — your DeFi assistant for Nuvari on Ethereum & Hedera.\n\nI have two engines:\n- **KAI** (RAG + Groq) — general DeFi Q&A\n- **Needle ⚡** (on-device, 14 MB) — live tool calls: Hedera balances, HCS logs, x402 status\n\nSwitch modes with the **Needle** button above, or open **Tools → Needle** for one-click live queries.\n\n🎤 **Voice mode**: hold the **mic button** in the input bar, speak your question, then release.',
    agent: 'KAI Agent', sources: 0,
  }]);
  const [input,       setInput]      = useState('');
  const [loading,     setLoading]    = useState(false);
  const [rag,         setRag]        = useState(true);
  const [needleMode,  setNeedleMode] = useState(false);
  const [toolsOpen,   setToolsOpen]  = useState(false);
  const [activeGroup, setActiveGroup]= useState(TOOLS[0].group);
  const [online,      setOnline]     = useState<boolean | null>(null);
  // Voice: transcript from mic populates the input, response text is appended to chat
  const BACKEND = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://127.0.0.1:8000';
  const handleVoiceTranscript = useCallback((text: string) => {
    setInput(text);
  }, []);
  const handleVoiceResponse = useCallback((text: string) => {
    setMsgs(prev => [...prev, { role: 'ai', text, agent: 'KAI Voice' }]);
  }, []);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  const checkHealth = useCallback(async () => {
    try {
      const r = await fetch(`${BACKEND}/health`, { signal: AbortSignal.timeout(3000) });
      setOnline(r.ok);
    } catch { setOnline(false); }
  }, [BACKEND]);
  useEffect(() => { checkHealth(); }, [checkHealth]);

  // ── Needle send path ────────────────────────────────────────────────────────
  const sendNeedle = async (query: string) => {
    const base = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://127.0.0.1:8000';
    setMsgs(prev => [...prev, {
      role: 'ai', text: '', agent: 'Needle ⚡', isNeedle: true,
    }]);
    try {
      const res = await fetch(`${base}/agents/needle/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      if (!res.ok) throw new Error(`Needle API ${res.status}`);
      const data = await res.json();
      // Build a readable summary from the tool result
      const results: NeedleToolResult[] = data.results ?? [];
      const first = results[0] as Record<string, any>;
      let summary = data.text || '';
      if (!summary && first) {
        const res = first.result !== undefined ? first.result : (first.output !== undefined ? first.output : first);
        if (res.error) {
          summary = `**Tool error:** ${res.error}`;
        } else {
          const hbar = res.hbar !== undefined ? res.hbar : res.hbar_balance;
          const tokens = res.tokens || res.token_balances;
          if (hbar !== undefined || tokens !== undefined) {
            const hbarVal = hbar !== undefined ? Number(hbar).toFixed(2) : '0.00';
            const tokensCount = Array.isArray(tokens) ? tokens.length : 0;
            summary = `### ⚡ Hedera Account Info (\`${res.account_id || ''}\`)\n\n- **HBAR Balance:** ${hbarVal} HBAR\n- **Token Holdings:** ${tokensCount} tokens associated\n- **Explorer:** [View on HashScan](${res.explorer || `https://hashscan.io/testnet/account/${res.account_id}`})`;
          } else if (res.balance !== undefined && (res.symbol || res.account_id)) {
            summary = `**KAIBAR Balance:** ${res.balance} ${res.symbol ?? 'KBAR'} (Account \`${res.account_id || ''}\`)`;
          } else if (Array.isArray(res.transactions)) {
            summary = `Retrieved **${res.transactions.length} recent transactions** for account \`${res.account_id || ''}\`.`;
          } else if (Array.isArray(res.messages)) {
            summary = `Retrieved **${res.messages.length} HCS audit log entries** from topic \`${res.topic_id || ''}\`.`;
          } else {
            const toolName = first.tool || first.tool_name || first.name || 'Needle Tool';
            summary = `**\`${toolName}\`** executed successfully. Expand the trace card below to view full details.`;
          }
        }
      }
      setMsgs(prev => {
        const c = [...prev];
        c[c.length - 1] = { ...c[c.length - 1], text: summary, needleResults: results };
        return c;
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMsgs(prev => {
        const c = prev.slice(0, -1);
        return [...c, { role: 'ai', text: `Needle error: ${msg}`, agent: 'Needle ⚡' }];
      });
    }
  };

  // ── Main send (routes to Needle or KAI) ─────────────────────────────────────
  const send = async (override?: string, forceNeedle?: boolean) => {
    const query = (override ?? input).trim();
    if (!query || loading) return;
    setInput('');
    setMsgs(prev => [...prev, { role: 'user', text: query }]);
    setLoading(true);
    try {
      if (needleMode || forceNeedle) {
        await sendNeedle(query);
      } else {
        const proposal = detectProposal(query);
        setMsgs(prev => [...prev, { role: 'ai', text: '', agent: 'KAI Agent', sources: 0, proposal }]);
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: query, rag, stream: true }),
        });
        if (!res.ok || !res.body) throw new Error(`API ${res.status}`);
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '', full = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n'); buf = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            try {
              const evt = JSON.parse(line.slice(5).trim());
              if (evt.token) {
                full += evt.token;
                setMsgs(prev => { const c = [...prev]; c[c.length-1] = { ...c[c.length-1], text: full }; return c; });
              }
              if (evt.done) setMsgs(prev => { const c = [...prev]; c[c.length-1] = { ...c[c.length-1], sources: evt.sources ?? 0 }; return c; });
            } catch { /* skip */ }
          }
        }
      }
    } catch {
      setMsgs(prev => {
        const c = prev.slice(0, -1);
        return [...c, { role: 'ai', text: 'Cannot reach agent server. Make sure `python server.py` is running at port 8000.', agent: 'System' }];
      });
    } finally { setLoading(false); }
  };

  const useTool = (q: string, isNeedle?: boolean) => {
    if (isNeedle) {
      setToolsOpen(false);
      setMsgs(prev => [...prev, { role: 'user', text: q }]);
      setLoading(true);
      sendNeedle(q).finally(() => setLoading(false));
    } else {
      setInput(q); setToolsOpen(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  return (
    <div style={{
      height: '100dvh', display: 'flex', flexDirection: 'column',
      background: 'transparent',
      color: '#f0f0ff', overflow: 'hidden',
      fontFamily: 'var(--font-sans)',
      position: 'relative',
    }}>
      {/* ── Aurora background ──────────────────────────────── */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: `
          radial-gradient(ellipse 70% 50% at 10% 0%,   rgba(16,185,129,0.18) 0%, transparent 60%),
          radial-gradient(ellipse 50% 40% at 90% 100%, rgba(5,150,105,0.10) 0%, transparent 55%),
          radial-gradient(ellipse 40% 35% at 50% 50%,  rgba(16,185,129,0.04) 0%, transparent 70%)
        `,
      }} />

      {/* ── TOP BAR ──────────────────────────────────────────── */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
        flexShrink: 0, zIndex: 10,
        background: 'rgba(6,6,8,0.97)',
        borderBottom: '1px solid rgba(16,185,129,0.20)',
        boxShadow: '0 1px 0 rgba(255,255,255,0.03), 0 4px 20px rgba(0,0,0,0.40)',
      }}>
        <Link href="/" style={{ color: 'rgba(255,255,255,0.30)', textDecoration: 'none', display: 'flex', alignItems: 'center', marginRight: 2 }}>
          <ChevronLeft size={20} />
        </Link>

        {/* Bot avatar — ETH style */}
        <div style={{
          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, #34d399 0%, #10b981 45%, #064e3b 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 0 2px rgba(16,185,129,0.25), 0 0 16px rgba(16,185,129,0.35)',
        }}>
          <Bot size={18} color="#fff" strokeWidth={1.8} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 800, margin: 0, lineHeight: 1.1, color: '#ffffff', letterSpacing: '-0.2px' }}>
            KAI Agent
            {needleMode && (
              <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, color: '#f472b6', background: 'rgba(244,114,182,0.14)', border: '1px solid rgba(244,114,182,0.30)', borderRadius: 5, padding: '1px 5px', letterSpacing: 0.6, textTransform: 'uppercase', verticalAlign: 'middle' }}>Needle ⚡</span>
            )}
          </p>
          <p style={{ fontSize: 10, margin: 0, lineHeight: 1.2, fontWeight: 700,
            color: online === true ? '#4ade80' : online === false ? '#f87171' : 'rgba(255,255,255,0.30)',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <span style={{ fontSize: 7 }}>●</span>
            {online === true ? (needleMode ? 'Needle mode · on-device tool calling' : 'Online · Sepolia / Hedera Testnet') : online === false ? 'Offline - start server' : 'Checking…'}
          </p>
        </div>

        {/* Needle mode toggle */}
        <button onClick={() => setNeedleMode(v => !v)} title="Switch to Needle on-device tool-calling mode" style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
          background: needleMode ? 'rgba(244,114,182,0.16)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${needleMode ? 'rgba(244,114,182,0.45)' : 'rgba(255,255,255,0.08)'}`,
          color: needleMode ? '#f9a8d4' : 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: 800, flexShrink: 0,
          transition: 'all 0.18s',
          boxShadow: needleMode ? '0 0 10px rgba(244,114,182,0.20)' : 'none',
        }}>
          <Cpu size={11} /> Needle
        </button>

        {/* Health refresh */}
        <button onClick={checkHealth} style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0, cursor: 'pointer',
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.18s',
        }}>
          <RefreshCw size={13} color="rgba(255,255,255,0.38)" />
        </button>

        {/* Tools toggle */}
        <button onClick={() => setToolsOpen(v => !v)} style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 8, cursor: 'pointer', flexShrink: 0,
          background: toolsOpen ? 'rgba(16,185,129,0.18)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${toolsOpen ? 'rgba(16,185,129,0.45)' : 'rgba(255,255,255,0.08)'}`,
          color: toolsOpen ? '#ff6b6b' : 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: 800,
          transition: 'all 0.18s',
          boxShadow: toolsOpen ? '0 0 12px rgba(16,185,129,0.20)' : 'none',
        }}>
          <Wrench size={12} color={toolsOpen ? '#ff6b6b' : 'rgba(255,255,255,0.38)'} /> Tools
        </button>
      </header>

      {/* ── BODY ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative', zIndex: 1 }}>

        {/* ── CHAT ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            {msgs.map((m, i) => {
              const isUser = m.role === 'user';
              return (
                <div key={i} style={{
                  display: 'flex', gap: 10,
                  flexDirection: isUser ? 'row-reverse' : 'row',
                  alignItems: 'flex-end',
                }}>
                  {/* Bot avatar */}
                  {!isUser && (
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%', flexShrink: 0, marginBottom: 2,
                      background: 'linear-gradient(135deg,#34d399,#10b981,#064e3b)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 0 10px rgba(16,185,129,0.28)',
                    }}>
                      <Bot size={14} color="#fff" strokeWidth={1.8} />
                    </div>
                  )}

                  <div style={{ maxWidth: '92%', display: 'flex', flexDirection: 'column', gap: 6, alignItems: isUser ? 'flex-end' : 'flex-start' }}>
                    {/* Agent label */}
                    {!isUser && m.agent && (
                      <span style={{
                        fontSize: 10, fontWeight: 800, letterSpacing: 0.8,
                        textTransform: 'uppercase', marginLeft: 4,
                        color: m.isNeedle ? 'rgba(244,114,182,0.80)' : 'rgba(16,185,129,0.70)',
                        display: 'flex', alignItems: 'center', gap: 5,
                      }}>
                        {m.isNeedle && <Cpu size={9} />}
                        {m.agent}{m.sources ? ` · ${m.sources} sources` : ''}
                      </span>
                    )}

                    {/* Bubble */}
                    <div style={{
                      padding: '14px 18px',
                      borderRadius: isUser ? '18px 18px 4px 18px' : '4px 18px 18px 18px',
                      background: isUser
                        ? 'linear-gradient(135deg, #34d399 0%, #10b981 50%, #059669 100%)'
                        : 'linear-gradient(135deg, rgba(22,12,14,0.96) 0%, rgba(18,14,20,0.94) 100%)',
                      border: isUser ? 'none' : '1px solid rgba(16,185,129,0.16)',
                      fontSize: 15, lineHeight: 1.75, color: isUser ? '#ffffff' : '#e8e8f0',
                      boxShadow: isUser
                        ? '0 4px 18px rgba(16,185,129,0.35), 0 1px 0 rgba(255,255,255,0.12) inset'
                        : '0 2px 16px rgba(0,0,0,0.40)',
                      wordBreak: 'break-word',
                    }}
                      dangerouslySetInnerHTML={{ __html: fmt(m.text || (loading && i === msgs.length - 1 ? '…' : '')) }}
                    />

                    {m.needleResults && m.needleResults.length > 0 && (
                      <NeedleTraceCard results={m.needleResults} />
                    )}
                    {m.proposal && <AgentProposalCard proposal={m.proposal} />}
                  </div>
                </div>
              );
            })}

            {/* Typing dots */}
            {loading && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg,#34d399,#064e3b)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 0 10px rgba(16,185,129,0.28)' }}>
                  <Loader2 size={14} color="#fff" style={{ animation: 'spin 1s linear infinite' }} />
                </div>
                <div style={{ padding: '11px 16px', borderRadius: '4px 18px 18px 18px', background: 'rgba(22,12,14,0.96)', border: '1px solid rgba(16,185,129,0.16)', display: 'flex', gap: 6, alignItems: 'center' }}>
                  {[0,1,2].map(n => (
                    <div key={n} style={{
                      width: 6, height: 6, borderRadius: '50%', background: '#10b981',
                      animation: `kai-dot ${0.8 + n*0.18}s ease-in-out infinite`,
                    }} />
                  ))}
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Quick suggestion chips */}
          <div style={{
            padding: '0 16px 8px', display: 'flex', gap: 7,
            overflowX: 'auto', scrollbarWidth: 'none', flexShrink: 0,
          }}>
            {['What tokens does KAI have?', 'Best vault APY?', 'How do I swap tokens?', 'How does M-Pesa work?', 'Explain KAI governance'].map(q => (
              <button key={q} onClick={() => send(q)} style={{
                flexShrink: 0, padding: '5px 13px', borderRadius: 999, cursor: 'pointer',
                background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.22)',
                color: 'rgba(240,240,255,0.60)', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                transition: 'all 0.16s',
              }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(16,185,129,0.18)';
                  (e.currentTarget as HTMLButtonElement).style.color = '#ffffff';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(16,185,129,0.45)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(16,185,129,0.08)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'rgba(240,240,255,0.60)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(16,185,129,0.22)';
                }}
              >{q}</button>
            ))}
          </div>

          {/* ── Input bar ── */}
          <div style={{
            padding: '10px 16px 14px', flexShrink: 0,
            borderTop: '1px solid rgba(16,185,129,0.14)',
            background: 'rgba(6,6,8,0.98)',
            display: 'flex', gap: 9, alignItems: 'flex-end',
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 110) + 'px';
              }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={needleMode
                ? 'Ask Needle: balances, transactions, HCS logs, x402 status…'
                : 'Ask KAI anything about DeFi, tokens, vaults…  (Enter to send)'}
              rows={1}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(16,185,129,0.18)',
                borderRadius: 14,
                padding: '11px 15px',
                color: '#f0f0ff', fontSize: 14,
                resize: 'none', outline: 'none', fontFamily: 'inherit',
                lineHeight: 1.55, minHeight: 44, maxHeight: 110,
                caretColor: '#10b981',
                transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
              onFocus={e => {
                e.target.style.borderColor = 'rgba(16,185,129,0.55)';
                e.target.style.boxShadow = '0 0 0 3px rgba(16,185,129,0.12)';
              }}
              onBlur={e => {
                e.target.style.borderColor = 'rgba(16,185,129,0.18)';
                e.target.style.boxShadow = 'none';
              }}
            />
            {/* Voice button — hold to talk */}
            <VoiceButton
              onTranscript={handleVoiceTranscript}
              onResponse={handleVoiceResponse}
              backendUrl={BACKEND}
              voice="ava"
              showPanel={true}
            />

            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              style={{
                width: 44, height: 44, borderRadius: 13, flexShrink: 0,
                cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
                background: input.trim() && !loading
                  ? 'linear-gradient(135deg, #34d399 0%, #10b981 50%, #059669 100%)'
                  : 'rgba(255,255,255,0.05)',
                border: input.trim() && !loading ? 'none' : '1px solid rgba(255,255,255,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: input.trim() && !loading ? '0 4px 18px rgba(16,185,129,0.45)' : 'none',
                transition: 'all 0.2s',
              }}
            >
              <Send size={17} color={input.trim() && !loading ? '#fff' : 'rgba(255,255,255,0.22)'} />
            </button>
          </div>
        </div>

        {/* ── TOOLS PANEL ──────────────────────────────────────── */}
        {toolsOpen && (
          <div style={{
            width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column',
            background: 'rgba(8,6,8,0.99)', borderLeft: '1px solid rgba(16,185,129,0.18)',
            overflow: 'hidden',
          }}>
            {/* Panel header */}
            <div style={{
              padding: '12px 16px', borderBottom: '1px solid rgba(16,185,129,0.14)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
              background: 'rgba(16,185,129,0.05)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: 7, background: 'rgba(16,185,129,0.16)',
                  border: '1px solid rgba(16,185,129,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Wrench size={12} color="#10b981" />
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#ffffff', letterSpacing: '-0.2px' }}>Agent Tools</span>
              </div>
              <button onClick={() => setToolsOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', display: 'flex', padding: 4, borderRadius: 6 }}>
                <X size={15} />
              </button>
            </div>

            {/* Tool groups */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {TOOLS.map(group => {
                const open = activeGroup === group.group;
                const Icon = group.icon;
                const isNeedleGroup = !!(group as { needle?: boolean }).needle;
                return (
                  <div key={group.group}>
                    <button
                      onClick={() => setActiveGroup(open ? '' : group.group)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                        padding: '11px 16px', cursor: 'pointer', border: 'none',
                        background: open ? `${group.color}12` : 'transparent',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        color: open ? group.color : 'rgba(240,240,255,0.48)',
                        fontSize: 12, fontWeight: 700, textAlign: 'left', transition: 'all 0.15s',
                      }}>
                      <Icon size={14} color={open ? group.color : 'rgba(255,255,255,0.28)'} strokeWidth={1.8} />
                      <span style={{ flex: 1 }}>{group.group}</span>
                      {isNeedleGroup && (
                        <span style={{ fontSize: 8, fontWeight: 800, color: '#f472b6', background: 'rgba(244,114,182,0.14)', border: '1px solid rgba(244,114,182,0.25)', borderRadius: 4, padding: '1px 4px', letterSpacing: 0.5, textTransform: 'uppercase' }}>live</span>
                      )}
                      <ChevronRight size={12} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', opacity: 0.45 }} />
                    </button>

                    {open && (
                      <div style={{ background: 'rgba(0,0,0,0.25)', padding: '6px 10px 10px' }}>
                        {isNeedleGroup && (
                          <p style={{ margin: '0 0 8px 2px', fontSize: 9, color: 'rgba(244,114,182,0.55)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                            <Cpu size={8} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                            On-device · Hedera live data
                          </p>
                        )}
                        {group.items.map(item => (
                          <button key={item.label} onClick={() => useTool(item.q, isNeedleGroup)} style={{
                            width: '100%', textAlign: 'left', padding: '8px 11px', borderRadius: 10, cursor: 'pointer',
                            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                            color: 'rgba(240,240,255,0.65)', fontSize: 11.5, marginBottom: 5,
                            display: 'flex', alignItems: 'center', gap: 8, lineHeight: 1.35,
                            transition: 'all 0.15s',
                          }}
                            onMouseEnter={e => {
                              (e.currentTarget as HTMLButtonElement).style.background = `${group.color}14`;
                              (e.currentTarget as HTMLButtonElement).style.color = '#ffffff';
                              (e.currentTarget as HTMLButtonElement).style.borderColor = `${group.color}30`;
                            }}
                            onMouseLeave={e => {
                              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.03)';
                              (e.currentTarget as HTMLButtonElement).style.color = 'rgba(240,240,255,0.65)';
                              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.06)';
                            }}
                          >
                            {isNeedleGroup ? <Zap size={9} color={group.color} style={{ flexShrink: 0 }} /> : <ChevronRight size={10} color={group.color} style={{ flexShrink: 0 }} />}
                            {item.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes kai-dot {
          0%,100% { opacity: 0.35; transform: translateY(0); }
          50%      { opacity: 1;    transform: translateY(-3px); }
        }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(16,185,129,0.30); border-radius: 2px; }
        textarea::placeholder { color: rgba(240,240,255,0.22) !important; }
      `}</style>
    </div>
  );
}
