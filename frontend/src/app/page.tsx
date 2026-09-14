'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount, useBalance, useReadContracts } from 'wagmi';
import { formatUnits } from 'viem';
import { useKaiStore } from '@/store/useKaiStore';
import WalletConnectModal from '@/components/WalletConnectModal';
import { ECOSYSTEM_TOKENS, TICKER_TOKENS } from '@/lib/tokens';
import { ERC20_ABI } from '@/lib/erc20abi';
import { formatChat } from '@/lib/formatChat';
import {
  subscribeHashPackState,
  getHashPackState,
  type HashPackState,
} from '@/lib/hashconnectClient';
import { getHtsPortfolio } from '@/lib/hederaTokens';
import {
  Trees, Store, Users, FlaskConical, ScanLine,
  Droplets, ImageIcon, Lock, Globe, LayoutGrid, Gift,
  Bot, Copy, RefreshCw, ChevronRight, TrendingUp,
  ShieldCheck, Coins, Wallet,
  CircleDollarSign, BarChart3, Activity, Zap,
} from 'lucide-react';

/* text-shadow so words are always readable over bg image */
const R:  React.CSSProperties = { textShadow: '0 1px 6px rgba(0,0,0,0.90)' };
const Rs: React.CSSProperties = { textShadow: '0 1px 4px rgba(0,0,0,0.88)' };

/* Colour is reserved for the brand name, the portfolio value, and active/live status */
const HL = {
  green: { color: '#34d399', fontWeight: 700 } as React.CSSProperties,
};

const QUICK = [
  { name: 'AI Agent',   href: '/ai',        icon: Bot,         color: '#10b981', bg: 'rgba(16,185,129,0.14)' },
  { name: 'Playground', href: '/nuvari',     icon: FlaskConical,color: '#34d399', bg: 'rgba(52,211,153,0.14)' },
  { name: 'Scan & Pay', href: '/pay',        icon: ScanLine,    color: '#22d3ee', bg: 'rgba(34,211,238,0.14)' },
  { name: 'Securities', href: '/securities', icon: ShieldCheck, color: '#06b6d4', bg: 'rgba(6,182,212,0.14)'  },
  { name: 'NFT Mkt',    href: '/connft',     icon: ImageIcon,   color: '#a855f7', bg: 'rgba(168,85,247,0.14)' },
  { name: 'Pools',      href: '/pools',      icon: Droplets,    color: '#059669', bg: 'rgba(5,150,105,0.14)'  },
  { name: 'Vaults',     href: '/vaults',     icon: Lock,        color: '#a3e635', bg: 'rgba(163,230,53,0.14)' },
  { name: 'Airdrop',    href: '/mine',       icon: Gift,        color: '#f59e0b', bg: 'rgba(245,158,11,0.14)' },
  { name: 'KAI Web',    href: '/kai',        icon: Globe,       color: '#10b981', bg: 'rgba(16,185,129,0.14)' },
  { name: 'TaaS',       href: '/taas',       icon: LayoutGrid,  color: '#ec4899', bg: 'rgba(236,72,153,0.14)' },
];

const DASHBOARDS = [
  { id:'cfa',    href:'/cfa',    icon:Trees, color:'#10b981', label:'CFA Dashboard',  hl:'Community Forest',   sub:'Treasury · Governance'  },
  { id:'sme',    href:'/sme',    icon:Store, color:'#22d3ee', label:'SME Dashboard',   hl:'Digitise Cash',      sub:'Loans · Inventory'      },
  { id:'saving', href:'/saving', icon:Users, color:'#a855f7', label:'Saving Group',    hl:'Pool Funds & Yield', sub:'Decentralised Savings'  },
];

function buildCalls(addr: `0x${string}` | undefined) {
  if (!addr) return [];
  return ECOSYSTEM_TOKENS.filter(t => t.address).map(t => ({
    address: t.address as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf' as const,
    args: [addr],
  }));
}

const TOKEN_ICON: Record<string, React.ComponentType<{ size:number; color:string; strokeWidth:number }>> = {
  HBAR: Activity, ETH: Activity, NVR: Zap, yBOB: CircleDollarSign,
  YTOKEN: TrendingUp, YGOLD: BarChart3, GAMI: Coins, CENTS: CircleDollarSign, KBAR: Coins,
};

const ESTIMATED_USD_RATES: Record<string, number> = {
  hbar: 0.12, eth: 26, ybob: 1, nvr: 0.12, ygold: 2.01, ytoken: 0.27, gami: 0.056, cents: 0.009, kbar: 0.05,
};

export default function Home() {
  const { address, isConnected } = useAccount();
  const { data: ethBal, refetch: refetchNative } = useBalance({ address });
  const { connectWallet, disconnectWallet, setNativeBalance, setAllBalances } = useKaiStore();

  const [hashPackState, setHashPackState] = useState<HashPackState>(getHashPackState());
  const [htsBals, setHtsBals]             = useState<Record<string, number>>({});
  const [htsHbar, setHtsHbar]             = useState<number>(0);

  const [showModal,  setShowModal]  = useState(false);
  const [tickerOff,  setTickerOff]  = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [copied,     setCopied]     = useState(false);
  const [agentQ,     setAgentQ]     = useState('');
  const [agentA,     setAgentA]     = useState('');
  const [agentBusy,  setAgentBusy]  = useState(false);
  const [profile,    setProfile]    = useState<{ name?: string; displayName?: string } | null>(null);
  const agentRef = useRef<HTMLTextAreaElement>(null);

  // Subscribe to HashPack session
  useEffect(() => {
    const unsub = subscribeHashPackState(setHashPackState);
    return unsub;
  }, []);

  const hashPackAccountId = hashPackState.session?.accountIds?.[0];

  // Fetch HashPack token balances from Hedera Mirror Node
  const fetchHashPackBalances = useCallback(async (accId: string) => {
    try {
      const p = await getHtsPortfolio(accId);
      setHtsHbar(p.hbar);
      const map: Record<string, number> = {};
      p.tokens.forEach(t => {
        map[t.symbol.toLowerCase()] = t.balance;
      });
      setHtsBals(map);
      setNativeBalance(p.hbar);
      setAllBalances({
        nvr: map.nvr ?? 0,
        ybob: map.ybob ?? 0,
        ytoken: map.ytoken ?? 0,
        ygold: map.ygold ?? 0,
        gami: map.gami ?? 0,
        cents: map.cents ?? 0,
      });
    } catch (err) {
      console.error('[HashPack Portfolio]', err);
    }
  }, [setNativeBalance, setAllBalances]);

  useEffect(() => {
    if (hashPackState.connected && hashPackAccountId) {
      connectWallet('hashpack' as any, hashPackAccountId);
      fetchHashPackBalances(hashPackAccountId);
    } else if (isConnected && address) {
      connectWallet('metamask', address);
    } else {
      disconnectWallet();
    }
  }, [hashPackState.connected, hashPackAccountId, isConnected, address, connectWallet, disconnectWallet, fetchHashPackBalances]);

  useEffect(() => {
    const activeAddr = address || hashPackAccountId;
    if (!activeAddr) { setProfile(null); return; }
    fetch(`/api/profile?wallet=${activeAddr}`)
      .then(r => r.json())
      .then(d => setProfile(d.profile ?? null))
      .catch(() => setProfile(null));
  }, [address, hashPackAccountId]);

  useEffect(() => {
    if (ethBal && !hashPackState.connected) {
      setNativeBalance(Number(formatUnits(ethBal.value, ethBal.decimals)));
    }
  }, [ethBal, hashPackState.connected, setNativeBalance]);

  const contractCalls = buildCalls(address);
  const { data: tokenData, refetch: refetchTokens } = useReadContracts({ contracts: contractCalls });

  const evmTokenBals: Record<string,number> = (() => {
    const out: Record<string,number> = {};
    ECOSYSTEM_TOKENS.filter(t => t.address).forEach((t,i) => {
      const r = tokenData?.[i];
      out[t.symbol.toLowerCase()] = r?.status==='success' && r.result!==undefined
        ? Number(formatUnits(r.result as bigint,18)) : 0;
    });
    ECOSYSTEM_TOKENS.filter(t => !t.address).forEach(t => { out[t.symbol.toLowerCase()] = 0; });
    return out;
  })();

  useEffect(() => {
    if (isConnected && !hashPackState.connected) {
      setAllBalances({
        nvr: evmTokenBals.nvr ?? 0,
        ybob: evmTokenBals.ybob ?? 0,
        ytoken: evmTokenBals.ytoken ?? 0,
        ygold: evmTokenBals.ygold ?? 0,
        gami: evmTokenBals.gami ?? 0,
        cents: evmTokenBals.cents ?? 0,
      });
    }
  }, [JSON.stringify(evmTokenBals), isConnected, hashPackState.connected, setAllBalances]);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    if (hashPackState.connected && hashPackAccountId) {
      await fetchHashPackBalances(hashPackAccountId);
    }
    await Promise.allSettled([refetchNative(), refetchTokens()]);
    setRefreshing(false);
  };

  useEffect(() => {
    const id = setInterval(() => setTickerOff(o => (o-1)%800), 26);
    return () => clearInterval(id);
  }, []);

  const isWalletConnected = isConnected || hashPackState.connected;
  const activeAddress = hashPackState.connected ? hashPackAccountId : address;
  const isHashPack = hashPackState.connected;

  const copyAddress = () => {
    if (!activeAddress) return;
    navigator.clipboard.writeText(activeAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const ethAmt = ethBal ? Number(formatUnits(ethBal.value, ethBal.decimals)) : 0;
  const nativeAmt = isHashPack ? htsHbar : ethAmt;
  const nativeSymbol = isHashPack ? 'HBAR' : 'ETH';
  const effectiveTokenBals = isHashPack ? htsBals : evmTokenBals;

  const allTokens = [
    { symbol: nativeSymbol, value: nativeAmt, color: '#10b981', deployed: true },
    ...ECOSYSTEM_TOKENS.map(t => ({
      symbol: t.symbol,
      value: effectiveTokenBals[t.symbol.toLowerCase()] ?? 0,
      color: t.color,
      deployed: isHashPack ? !!t.htsTokenId : !!t.address,
    })),
  ];

  const nativeRate = isHashPack ? ESTIMATED_USD_RATES.hbar : ESTIMATED_USD_RATES.eth;
  const totalUsd = nativeAmt * nativeRate
    + (effectiveTokenBals.ybob ?? 0) * ESTIMATED_USD_RATES.ybob
    + (effectiveTokenBals.nvr ?? 0) * ESTIMATED_USD_RATES.nvr
    + (effectiveTokenBals.ygold ?? 0) * ESTIMATED_USD_RATES.ygold
    + (effectiveTokenBals.ytoken ?? 0) * ESTIMATED_USD_RATES.ytoken
    + (effectiveTokenBals.gami ?? 0) * ESTIMATED_USD_RATES.gami
    + (effectiveTokenBals.cents ?? 0) * ESTIMATED_USD_RATES.cents
    + (effectiveTokenBals.kbar ?? 0) * ESTIMATED_USD_RATES.kbar;

  const activeTokenCount = allTokens.filter(b => b.value > 0).length;
  const displayName = profile?.displayName || profile?.name || (activeAddress ? (isHashPack ? activeAddress : `${activeAddress.slice(0,6)}…${activeAddress.slice(-4)}`) : '');

  const askAgent = async () => {
    if (!agentQ.trim() || agentBusy) return;
    setAgentBusy(true); setAgentA('');
    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: agentQ, rag: true }),
      });
      const d = await r.json();
      setAgentA(d.text || d.response || 'No answer returned.');
    } catch { setAgentA('Agent offline. Start the server.'); }
    finally { setAgentBusy(false); }
  };

  /* Centred column, max 1280px */
  const W: React.CSSProperties = { width:'100%', maxWidth:1280, margin:'0 auto', padding:'0 40px' };

  return (
    <main style={{ minHeight:'100dvh', color:'#fff', fontFamily:'var(--font-sans)', position:'relative', paddingBottom:80 }}>

      {/* ambient orbs */}
      <div aria-hidden style={{ position:'fixed', inset:0, pointerEvents:'none', zIndex:0 }}>
        <div style={{ position:'absolute', top:'6%', right:'-10%', width:420, height:420, borderRadius:'50%', background:'radial-gradient(circle,rgba(16,185,129,0.09) 0%,transparent 68%)', animation:'orb-drift-a 12s ease-in-out infinite' }} />
        <div style={{ position:'absolute', bottom:'28%', left:'-8%', width:320, height:320, borderRadius:'50%', background:'radial-gradient(circle,rgba(6,182,212,0.06) 0%,transparent 68%)', animation:'orb-drift-b 15s ease-in-out infinite' }} />
        <div style={{ position:'absolute', top:'42%', left:'22%', width:280, height:280, borderRadius:'50%', background:'radial-gradient(circle,rgba(168,85,247,0.06) 0%,transparent 68%)', animation:'orb-drift-b 19s ease-in-out infinite reverse' }} />
      </div>

      {/* 1 ── TICKER */}
      <div className="ticker-wrap" style={{ padding:'6px 0', position:'relative', zIndex:5 }}>
        <div style={{ display:'inline-flex', gap:36, paddingLeft:20, transform:`translateX(${tickerOff}px)`, whiteSpace:'nowrap', transition:'none' }}>
          {[...TICKER_TOKENS,...TICKER_TOKENS,...TICKER_TOKENS].map((t,i) => (
            <span key={i} style={{ fontSize:11, fontWeight:600 }}>
              <span style={{ color:'rgba(255,255,255,0.40)' }}>{t.s} </span>
              <span style={{ color:'rgba(255,255,255,0.85)', fontWeight:700 }}>{t.p} </span>
              <span style={{ color:'#34d399', fontWeight:800 }}>{t.c}</span>
            </span>
          ))}
        </div>
      </div>

      {/* 2 ── BRAND HERO */}
      <motion.div initial={{ opacity:0, y:-10 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.05 }}
        style={{ ...W, paddingTop:28, textAlign:'center', position:'relative', zIndex:5 }}>
        <div className="float" style={{
          width:68, height:68, borderRadius:'50%', margin:'0 auto 12px',
          background:'linear-gradient(135deg,rgba(16,185,129,0.38),rgba(4,78,59,0.80))',
          backdropFilter:'blur(12px)',
          display:'flex', alignItems:'center', justifyContent:'center', fontSize:30,
          boxShadow:'0 0 36px rgba(16,185,129,0.42), 0 0 0 1.5px rgba(16,185,129,0.35) inset',
        }}>⛰️</div>
        <h1 style={{ fontSize:32, fontWeight:900, margin:'0 0 5px', letterSpacing:'-1px', ...R }}>
          <span style={HL.green}>KAI</span> <span style={{ color:'#fff' }}>NUVARI</span>
        </h1>
        <p style={{ fontSize:11, fontWeight:700, letterSpacing:2.8, textTransform:'uppercase', color:'rgba(255,255,255,0.52)', margin:0, ...Rs }}>
          HEDERA & ETHEREUM · X402 DEFI ECOSYSTEM
        </p>
      </motion.div>

      {/* 3 ── CONNECT WALLET */}
      <motion.div initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.10 }}
        style={{ ...W, marginTop:16, position:'relative', zIndex:5 }}>
        <motion.button whileHover={{ scale:1.02 }} whileTap={{ scale:0.97 }} onClick={() => setShowModal(true)}
          style={{
            width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:10,
            padding:'13px 24px', borderRadius:14, cursor:'pointer', border:'none',
            background:'linear-gradient(135deg,#10b981,#047857)',
            boxShadow:'0 6px 28px rgba(16,185,129,0.45), 0 1px 0 rgba(255,255,255,0.18) inset',
            fontSize:15, fontWeight:800, color:'#fff', ...R,
          }}>
          <span style={{ fontSize:16 }}>🔗</span>
          {isWalletConnected
            ? (isHashPack
                ? `HashPack: ${hashPackAccountId}`
                : `Connected: ${address?.slice(0,6)}…${address?.slice(-4)}`)
            : 'Connect Wallet'}
          {isWalletConnected && <span style={{ width:8, height:8, borderRadius:'50%', background:'#6ee7b7', boxShadow:'0 0 8px #6ee7b7', animation:'pulse-dot 2s ease-in-out infinite' }} />}
        </motion.button>
      </motion.div>

      {/* 4 ── NETWORK STRIP */}
      <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} whileHover={{ y:-2 }} transition={{ delay:0.14 }}
        style={{ ...W, marginTop:12, position:'relative', zIndex:5 }}>
        <div className="glass hover-shine" style={{
          padding:'12px 20px', borderRadius:14,
          background:'rgba(16,185,129,0.08)', backdropFilter:'blur(16px)',
          boxShadow:'0 0 0 1px rgba(16,185,129,0.22) inset, 0 3px 20px rgba(0,0,0,0.32)',
          display:'flex', alignItems:'center', gap:14,
        }}>
          <span style={{ fontSize:22, flexShrink:0 }}>⛰️</span>
          <div style={{ flex:1 }}>
            <p style={{ fontSize:14, fontWeight:800, margin:'0 0 2px', color:'rgba(255,255,255,0.92)', ...R }}>
              Hedera &amp; Ethereum (X402)
              <span style={{ color:'rgba(255,255,255,0.55)', fontWeight:500 }}> · HashPack &amp; MetaMask</span>
            </p>
            <p style={{ fontSize:12, color:'rgba(255,255,255,0.50)', margin:0, ...Rs }}>
              7 Ecosystem Tokens · DeFi Vaults · DAO Governance
            </p>
          </div>
          <div style={{ display:'flex', gap:4, flexShrink:0 }}>
            {[0,1,2].map(i => <div key={i} style={{ width:7, height:7, borderRadius:'50%', background:'#34d399', opacity:0.4+i*0.22, animation:`pulse-gold ${0.9+i*0.22}s ease-in-out infinite` }} />)}
          </div>
        </div>
      </motion.div>

      {/* 5 ── PROFILE HERO */}
      <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.18 }}
        style={{ ...W, marginTop:12, position:'relative', zIndex:5 }}>
        <div className="glass-elevated" style={{ borderRadius:20, overflow:'hidden', boxShadow:'0 0 0 0.5px rgba(16,185,129,0.18) inset, 0 12px 48px rgba(0,0,0,0.48)' }}>

          {/* cover */}
          <div style={{
            height:100,
            background:'linear-gradient(135deg,rgba(4,78,59,0.88) 0%,rgba(6,182,212,0.32) 50%,rgba(168,85,247,0.25) 100%)',
            position:'relative', overflow:'hidden',
          }}>
            <div style={{ position:'absolute', inset:0, background:'repeating-linear-gradient(110deg,transparent 0px,transparent 36px,rgba(255,255,255,0.025) 36px,rgba(255,255,255,0.025) 37px)', pointerEvents:'none' }} />
            <div style={{ position:'absolute', bottom:-30, right:-30, width:160, height:160, borderRadius:'50%', background:'radial-gradient(circle,rgba(16,185,129,0.25) 0%,transparent 70%)', pointerEvents:'none' }} />
            {/* KAI member badge */}
            <div style={{
              position:'absolute', top:12, right:14,
              padding:'4px 11px', borderRadius:999,
              background:'rgba(16,185,129,0.16)', backdropFilter:'blur(10px)',
              boxShadow:'0 0 0 1px rgba(16,185,129,0.36) inset',
              fontSize:11, fontWeight:800, color:'#34d399',
            }}>✦ KAI Member</div>
          </div>

          {/* body */}
          <div style={{ background:'rgba(8,8,16,0.80)', backdropFilter:'blur(24px)', padding:'0 24px 20px' }}>

            {/* avatar row */}
            <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginTop:-40 }}>
              <div style={{ position:'relative', flexShrink:0 }}>
                <div style={{
                  width:82, height:82, borderRadius:'50%',
                  background:'linear-gradient(135deg,#10b981,#22d3ee,#a855f7)',
                  padding:2.5, boxShadow:'0 0 28px rgba(16,185,129,0.48)',
                }}>
                  <div className="float" style={{
                    width:'100%', height:'100%', borderRadius:'50%',
                    background:'linear-gradient(135deg,rgba(16,185,129,0.50),rgba(4,78,59,0.88))',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:32, fontWeight:900, color:'#6ee7b7',
                  }}>{(displayName || 'K').charAt(0).toUpperCase()}</div>
                </div>
                <span style={{
                  position:'absolute', bottom:4, right:2, width:14, height:14, borderRadius:'50%',
                  background:'#22c55e', border:'2.5px solid rgba(8,8,16,0.88)',
                  boxShadow:'0 0 8px rgba(34,197,94,0.65)',
                  animation:'pulse-dot 2.5s ease-in-out infinite', display:'block',
                }} />
              </div>
              {/* status pills */}
              <div style={{ display:'flex', gap:8, marginBottom:6 }}>
                <span style={{ padding:'5px 12px', borderRadius:9, background:'rgba(16,185,129,0.11)', boxShadow:'0 0 0 1px rgba(16,185,129,0.28) inset', fontSize:12, fontWeight:700, color:'#34d399' }}>● Active</span>
                <span style={{ padding:'5px 12px', borderRadius:9, background:'rgba(255,255,255,0.05)', boxShadow:'0 0 0 0.5px rgba(255,255,255,0.10) inset', fontSize:12, fontWeight:600, color:'rgba(255,255,255,0.58)' }}>🇰🇪 Kenya</span>
              </div>
            </div>

            {/* name + handle */}
            <div style={{ marginTop:10, marginBottom:14 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
                <h2 style={{ fontSize:22, fontWeight:900, margin:0, letterSpacing:'-0.4px', color:'#fff', ...R }}>
                  {isWalletConnected ? (displayName || 'KAI Member') : 'Not Connected'}
                </h2>
                {isWalletConnected && <span style={{ width:20, height:20, borderRadius:'50%', background:'linear-gradient(135deg,#10b981,#047857)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, flexShrink:0, boxShadow:'0 0 10px rgba(16,185,129,0.55)' }}>✓</span>}
              </div>
              {isWalletConnected && !profile && (
                <Link href="/profile" style={{ fontSize:12, color:'#34d399', margin:'0 0 5px', textDecoration:'none', ...Rs }}>
                  Complete your profile →
                </Link>
              )}
              <p style={{ fontSize:13, color:'rgba(255,255,255,0.60)', margin:'4px 0 0', lineHeight:1.55, ...Rs }}>
                {isWalletConnected ? (isHashPack ? 'KAI Nuvari member · Hedera Native' : 'KAI Nuvari member · Hedera EVM') : 'Connect a wallet to see your profile'}
              </p>
            </div>

            {/* stats strip */}
            <div style={{
              display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10,
              padding:'13px 16px', borderRadius:14,
              background:'rgba(255,255,255,0.04)',
              boxShadow:'0 0 0 0.5px rgba(255,255,255,0.07) inset',
            }}>
              {[
                { label:'Est. Value', value: isWalletConnected ? `$${totalUsd.toFixed(2)}` : '$0.00', color:'#34d399', icon:'💼' },
                { label:'Network',   value: isHashPack ? 'Hedera' : isConnected ? 'Hedera EVM' : 'Hedera', color:null, icon:'⛰️' },
                { label:'Tokens',    value: isWalletConnected ? String(activeTokenCount) : '0', color:null, icon:'🪙' },
                { label:'Status',    value: isWalletConnected ? 'Active' : 'Idle', color: isWalletConnected ? '#34d399' : null, icon:'⚡' },
              ].map(s => (
                <div key={s.label} style={{ textAlign:'center' }}>
                  <span style={{ fontSize:18, display:'block', marginBottom:4 }}>{s.icon}</span>
                  <p style={{ fontSize:15, fontWeight:800, color:s.color ?? 'rgba(255,255,255,0.90)', margin:'0 0 2px', ...(s.color ? { textShadow:`0 0 10px ${s.color}50` } : {}), ...Rs }}>{s.value}</p>
                  <p style={{ fontSize:10, color:'rgba(255,255,255,0.38)', fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', margin:0 }}>{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      {/* 6 ── PORTFOLIO */}
      <motion.div initial={{ opacity:0, scale:0.98 }} animate={{ opacity:1, scale:1 }} transition={{ delay:0.22, duration:0.35 }}
        style={{ ...W, marginTop:12, position:'relative', zIndex:5 }}>
        <div className="glass-elevated hover-shine" style={{
          borderRadius:20, padding:'22px 26px 18px',
          background:'linear-gradient(145deg,rgba(10,20,16,0.78),rgba(6,6,14,0.72))',
          backdropFilter:'blur(28px) saturate(1.8)',
          boxShadow:'0 1px 0 rgba(255,255,255,0.09) inset, 0 0 0 0.5px rgba(16,185,129,0.18) inset, 0 16px 50px rgba(0,0,0,0.50)',
          overflow:'hidden', position:'relative',
        }}>
          <div style={{ position:'absolute', top:-40, right:-40, width:200, height:200, borderRadius:'50%', background:'radial-gradient(circle,rgba(16,185,129,0.14) 0%,transparent 70%)', pointerEvents:'none' }} />

          <p style={{ fontSize:10, fontWeight:700, letterSpacing:1.4, textTransform:'uppercase', color:'rgba(255,255,255,0.48)', marginBottom:6, ...Rs }}>⛰️ Est. Portfolio Value</p>
          <div style={{ display:'flex', alignItems:'baseline', gap:12, marginBottom:16 }}>
            <span style={{ fontSize:40, fontWeight:900, letterSpacing:-2, color:isWalletConnected?'#fff':'rgba(255,255,255,0.20)', lineHeight:1, ...R }}>
              ${isWalletConnected ? totalUsd.toFixed(2) : '0.00'}
            </span>
            {isWalletConnected && totalUsd>0 && <span style={{ fontSize:13, ...HL.green }}>+0.00%</span>}
          </div>

          {isWalletConnected ? (
            <>
              <div style={{ overflowX:'auto', scrollbarWidth:'none', marginBottom:14 }}>
                <div style={{ display:'flex', gap:8, minWidth:'max-content' }}>
                  {allTokens.map(b => {
                    const Icon = TOKEN_ICON[b.symbol] || Coins;
                    return (
                      <motion.div key={b.symbol} whileHover={{ y:-3, scale:1.05 }} style={{
                        minWidth:78, padding:'9px 8px', borderRadius:14, textAlign:'center',
                        background:`linear-gradient(145deg,${b.color}12,rgba(6,6,10,0.55))`,
                        backdropFilter:'blur(10px)',
                        boxShadow:`0 0 0 0.5px ${b.color}25 inset`,
                        position:'relative', cursor:'default',
                      }}>
                        <span style={{ display:'block', margin:'0 auto 4px' }}><Icon size={15} color={b.color} strokeWidth={1.8} /></span>
                        <p style={{ fontSize:9, color:'rgba(255,255,255,0.50)', margin:'0 0 2px', fontWeight:700, letterSpacing:0.3 }}>{b.symbol}</p>
                        <p style={{ fontSize:13, fontWeight:800, color:b.color, margin:0, textShadow:`0 0 8px ${b.color}80` }}>
                          {b.value>=1000?`${(b.value/1000).toFixed(1)}K`:b.value>=0.001?b.value.toFixed(3):'0.000'}
                        </p>
                        {!b.deployed && <div style={{ position:'absolute', top:2, right:4, fontSize:6, color:'rgba(255,255,255,0.25)', fontWeight:700 }}>SOON</div>}
                      </motion.div>
                    );
                  })}
                </div>
              </div>
              <div style={{ display:'flex', gap:7 }}>
                <div style={{ flex:1, background:'rgba(255,255,255,0.05)', backdropFilter:'blur(8px)', boxShadow:'0 0 0 0.5px rgba(255,255,255,0.07) inset', borderRadius:10, padding:'7px 12px', fontFamily:'monospace', fontSize:10, color:'rgba(255,255,255,0.48)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {activeAddress}
                </div>
                <motion.button whileTap={{ scale:0.93 }} onClick={copyAddress} style={{ padding:'7px 12px', borderRadius:10, border:'none', cursor:'pointer', background:copied?'rgba(52,211,153,0.14)':'rgba(255,255,255,0.05)', backdropFilter:'blur(8px)', color:copied?'#34d399':'rgba(255,255,255,0.48)', fontSize:11, fontWeight:700, display:'flex', alignItems:'center', gap:4, transition:'all 0.2s' }}>
                  {copied?'✓':(<><Copy size={12}/> Copy</>)}
                </motion.button>
                <motion.button whileTap={{ scale:0.93 }} onClick={handleRefresh} style={{ padding:'7px 10px', borderRadius:10, border:'none', cursor:'pointer', background:'rgba(255,255,255,0.05)', backdropFilter:'blur(8px)', color:'rgba(255,255,255,0.48)' }}>
                  <RefreshCw size={12} style={{ animation:refreshing?'spin 1s linear infinite':'none' }} />
                </motion.button>
              </div>
            </>
          ) : (
            <motion.button whileHover={{ scale:1.02 }} whileTap={{ scale:0.97 }} onClick={() => setShowModal(true)} style={{
              width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:9,
              background:'rgba(16,185,129,0.08)', backdropFilter:'blur(14px)',
              boxShadow:'0 0 0 1px rgba(16,185,129,0.26) inset',
              borderRadius:13, padding:'12px 0', cursor:'pointer', border:'none',
              fontSize:14, fontWeight:700, ...HL.green,
            }}>
              <Wallet size={16}/> Connect HashPack / MetaMask to view balances
            </motion.button>
          )}
        </div>
      </motion.div>

      {/* 7 ── KAI AGENT */}
      <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.28 }}
        style={{ ...W, marginTop:16, position:'relative', zIndex:5 }}>
        <div className="glass-prism" style={{
          borderRadius:20,
          background:'rgba(6,6,14,0.72)', backdropFilter:'blur(26px) saturate(1.8)',
          boxShadow:'0 0 0 0.5px rgba(16,185,129,0.20) inset, 0 12px 40px rgba(0,0,0,0.48)',
          overflow:'hidden',
        }}>
          {/* header */}
          <div style={{ padding:'14px 22px', background:'rgba(16,185,129,0.08)', boxShadow:'0 1px 0 rgba(255,255,255,0.05)', display:'flex', alignItems:'center', gap:12 }}>
            <div className="float" style={{ width:38, height:38, borderRadius:'50%', background:'linear-gradient(135deg,#10b981,#064e3b)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 16px rgba(16,185,129,0.55)', flexShrink:0 }}>
              <Bot size={19} color="#fff" />
            </div>
            <div style={{ flex:1 }}>
              <p style={{ fontSize:15, fontWeight:800, margin:'0 0 2px', color:'#fff', ...Rs }}>
                <span style={HL.green}>KAI</span> Intelligence
              </p>
              <p style={{ fontSize:10, color:'#34d399', margin:0, fontWeight:700 }}>● KAI AI Assistant · Live</p>
            </div>
            <Link href="/ai" style={{ fontSize:12, color:'rgba(255,255,255,0.48)', textDecoration:'none', fontWeight:700, display:'flex', alignItems:'center', gap:3, flexShrink:0 }}>
              Full chat <ChevronRight size={13}/>
            </Link>
          </div>

          {/* chips */}
          <div style={{ padding:'12px 22px 0' }}>
            <p style={{ fontSize:9, fontWeight:700, letterSpacing:1.2, textTransform:'uppercase', color:'rgba(255,255,255,0.38)', marginBottom:9 }}>Quick Ask</p>
            <div style={{ display:'flex', flexWrap:'wrap', gap:7, marginBottom:12 }}>
              {['What tokens does KAI have?','Best yield now?','How to get started?','Pool rates?'].map(q => (
                <motion.button key={q} whileHover={{ scale:1.03, y:-1 }} whileTap={{ scale:0.96 }} onClick={() => setAgentQ(q)} style={{
                  padding:'6px 13px', borderRadius:18, border:'none', cursor:'pointer',
                  background:agentQ===q?'rgba(16,185,129,0.14)':'rgba(255,255,255,0.05)',
                  backdropFilter:'blur(8px)',
                  boxShadow:agentQ===q?'0 0 0 1px rgba(52,211,153,0.38) inset':'0 0 0 0.5px rgba(255,255,255,0.08) inset',
                  color:agentQ===q?'#34d399':'rgba(255,255,255,0.65)',
                  fontSize:12, fontWeight:600, transition:'all 0.14s',
                }}>{q}</motion.button>
              ))}
            </div>
          </div>

          {/* input */}
          <div style={{ padding:'0 22px 18px', display:'flex', gap:9 }}>
            <textarea ref={agentRef} value={agentQ}
              onChange={e => setAgentQ(e.target.value)}
              onKeyDown={e => e.key==='Enter' && !e.shiftKey && (e.preventDefault(), askAgent())}
              placeholder="Ask KAI anything about the ecosystem…" rows={2}
              style={{ flex:1, background:'rgba(255,255,255,0.05)', border:'none', boxShadow:'0 0 0 1px rgba(255,255,255,0.09) inset', borderRadius:12, padding:'10px 13px', fontSize:13, color:'#fff', outline:'none', fontFamily:'inherit', resize:'none', lineHeight:1.5, caretColor:'#34d399' }}
              onFocus={e => (e.target.style.boxShadow='0 0 0 1.5px rgba(52,211,153,0.48) inset')}
              onBlur={e  => (e.target.style.boxShadow='0 0 0 1px rgba(255,255,255,0.09) inset')}
            />
            <motion.button whileHover={{ scale:1.09 }} whileTap={{ scale:0.92 }} onClick={askAgent} disabled={agentBusy||!agentQ.trim()} style={{
              width:44, height:44, borderRadius:12, alignSelf:'flex-end', flexShrink:0, border:'none',
              background:agentQ.trim()&&!agentBusy?'linear-gradient(135deg,#34d399,#047857)':'rgba(255,255,255,0.06)',
              cursor:agentQ.trim()?'pointer':'not-allowed',
              display:'flex', alignItems:'center', justifyContent:'center',
              boxShadow:agentQ.trim()&&!agentBusy?'0 0 16px rgba(52,211,153,0.48)':'none',
              transition:'all 0.2s',
            }}>
              <Activity size={19} color={agentQ.trim()&&!agentBusy?'#fff':'rgba(255,255,255,0.20)'} />
            </motion.button>
          </div>

          <AnimatePresence>
            {agentA && (
              <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }} exit={{ opacity:0, height:0 }}
                style={{ margin:'0 22px 18px', padding:'12px 15px', background:'rgba(16,185,129,0.08)', boxShadow:'0 0 0 1px rgba(52,211,153,0.18) inset', borderRadius:12, fontSize:13, color:'rgba(255,255,255,0.85)', lineHeight:1.65, maxHeight:200, overflowY:'auto' }}>
                <span dangerouslySetInnerHTML={{ __html:formatChat(agentA) }} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* 8 ── DASHBOARDS */}
      <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.32 }}
        style={{ ...W, marginTop:24, position:'relative', zIndex:5 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
          <p style={{ fontSize:10, fontWeight:700, letterSpacing:1.4, textTransform:'uppercase', color:'rgba(255,255,255,0.52)', margin:0 }}>Dashboards</p>
          <span className="badge badge-live">3 Active</span>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {DASHBOARDS.map((d,i) => {
            const Icon = d.icon;
            return (
              <motion.div key={d.id}
                initial={{ opacity:0, x:-14 }} animate={{ opacity:1, x:0 }} transition={{ delay:0.34+i*0.06 }}
                whileHover={{ x:4 }}>
                <Link href={d.href} style={{ textDecoration:'none' }}>
                  <div className="hover-shine" style={{
                    borderRadius:16, padding:'14px 18px',
                    display:'flex', alignItems:'center', gap:14,
                    background:`linear-gradient(110deg,${d.color}10 0%,rgba(6,6,14,0.60) 100%)`,
                    backdropFilter:'blur(20px)',
                    boxShadow:`0 0 0 0.5px ${d.color}20 inset, 0 6px 26px rgba(0,0,0,0.35)`,
                    transition:'box-shadow 0.22s',
                  }}>
                    <div style={{ width:46, height:46, borderRadius:14, flexShrink:0, background:`${d.color}16`, backdropFilter:'blur(8px)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 0 18px ${d.color}28` }}>
                      <Icon size={22} color={d.color} strokeWidth={1.65}/>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontSize:15, fontWeight:800, margin:'0 0 2px', color:'rgba(255,255,255,0.94)', ...R }}>{d.hl}</p>
                      <p style={{ fontSize:12, fontWeight:600, color:'rgba(255,255,255,0.80)', margin:'0 0 1px', ...Rs }}>{d.label}</p>
                      <p style={{ fontSize:11, color:'rgba(255,255,255,0.45)', margin:0 }}>{d.sub}</p>
                    </div>
                    <ChevronRight size={16} color="rgba(255,255,255,0.25)"/>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* 9 ── QUICK ACTIONS */}
      <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.36 }}
        style={{ ...W, marginTop:24, paddingBottom:40, position:'relative', zIndex:5 }}>
        <p style={{ fontSize:10, fontWeight:700, letterSpacing:1.4, textTransform:'uppercase', color:'rgba(255,255,255,0.52)', margin:'0 0 14px' }}>
          Quick Actions
        </p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:12 }}>
          {QUICK.map((a,i) => {
            const Icon = a.icon;
            return (
              <motion.div key={a.name}
                initial={{ opacity:0, y:14 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.38+i*0.03 }}
                whileHover={{ y:-6, scale:1.04 }} whileTap={{ scale:0.95 }}>
                <Link href={a.href} style={{ textDecoration:'none' }}>
                  <div className="hover-shine" style={{
                    display:'flex', flexDirection:'column', alignItems:'center', gap:9,
                    padding:'18px 10px', borderRadius:18, cursor:'pointer',
                    background:'rgba(4,4,10,0.52)', backdropFilter:'blur(18px)',
                    boxShadow:`0 0 0 0.5px ${a.color}20 inset, 0 5px 20px rgba(0,0,0,0.40)`,
                    transition:'box-shadow 0.22s',
                  }}>
                    <div style={{
                      width:50, height:50, borderRadius:16, flexShrink:0,
                      background:`linear-gradient(145deg,${a.bg},rgba(4,4,10,0.70))`,
                      backdropFilter:'blur(10px)',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      boxShadow:`0 4px 16px ${a.color}22, 0 0 0 0.5px ${a.color}28 inset`,
                    }}>
                      <Icon size={23} color={a.color} strokeWidth={1.6}/>
                    </div>
                    <span style={{ fontSize:12, fontWeight:700, color:'rgba(255,255,255,0.88)', textAlign:'center', lineHeight:1.2, textShadow:'0 1px 5px rgba(0,0,0,0.85)' }}>
                      {a.name}
                    </span>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* Modal */}
      {showModal && <WalletConnectModal onClose={() => setShowModal(false)} />}
    </main>
  );
}
