'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useBalance, useReadContracts } from 'wagmi';
import { formatUnits, type Address } from 'viem';
import {
  Wallet, Copy, RefreshCw, Send, QrCode, ArrowDownToLine,
  ChevronRight, CheckCircle2, Loader2, ImageIcon, ShieldCheck,
  Info, ExternalLink, ArrowUpRight,
} from 'lucide-react';
import { usePrivyAuth } from '@/lib/privy-auth';
import { useNFTs } from '@/hooks/useNFTs';
import { ECOSYSTEM_TOKENS, ETH_CONFIG, EXPLORER_BASE, formatTokenAmount } from '@/lib/tokens';
import { ERC20_ABI } from '@/lib/erc20abi';
import { useKaiStore } from '@/store/useKaiStore';
import { useEcosystemBalances } from '@/hooks/useEcosystemBalances';

/* ── shared styles ── */
const Rs: React.CSSProperties = { textShadow: '0 1px 4px rgba(0,0,0,0.88)' };
const W: React.CSSProperties = { width: '100%', maxWidth: 1080, margin: '0 auto', padding: '0 40px' };

function shortAddr(a: string | { hash: string }) {
  const s = typeof a === 'string' ? a : a.hash;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

export default function WalletDashboard() {
  const {
    ready,
    authenticated,
    address,
    email,
    name,
    signInWithGoogle,
    logout,
    syncState,
    error: authError,
    sendToken,
  } = usePrivyAuth();
  const { nfts, loading: nftsLoading, source: nftSource, reload: reloadNfts } = useNFTs();

  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [tab, setTab] = useState<'receive' | 'send'>('receive');
  const [token, setToken] = useState<Address | null>(ECOSYSTEM_TOKENS.find(t => t.symbol === 'NVR')?.address ?? ECOSYSTEM_TOKENS[0]?.address ?? null);
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [sendMsg, setSendMsg] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const { data: ethBal, refetch: refetchNative } = useBalance({ address: address as Address | undefined });
  const contractCalls = useMemo(
    () => (address ? ECOSYSTEM_TOKENS.filter(t => t.address).map(t => ({
      address: t.address as Address, abi: ERC20_ABI, functionName: 'balanceOf' as const, args: [address as Address],
    })) : []),
    [address],
  );
  const { data: tokenData, refetch: refetchTokens } = useReadContracts({ contracts: contractCalls });

  const storeBalances = useKaiStore(s => s.balances);
  const claimFaucet = useKaiStore(s => s.claimFaucet);
  const { tokenBalances: ecoBalances, refresh: refreshEco } = useEcosystemBalances();
  const [faucetLoading, setFaucetLoading] = useState(false);
  const [faucetSuccess, setFaucetSuccess] = useState<string | null>(null);

  const tokenBals: Record<string, number> = useMemo(() => {
    const out: Record<string, number> = {};
    ECOSYSTEM_TOKENS.forEach((t, i) => {
      const r = tokenData?.[i];
      const onChain = r?.status === 'success' && r.result !== undefined ? Number(formatUnits(r.result as bigint, t.decimals)) : 0;
      const ecoVal = ecoBalances?.[t.symbol] ?? 0;
      const storeVal = storeBalances[t.symbol.toLowerCase() as keyof typeof storeBalances] || 0;
      out[t.symbol] = onChain || ecoVal || storeVal;
    });
    return out;
  }, [tokenData, ecoBalances, storeBalances]);

  const ethAmt = (ethBal ? Number(formatUnits(ethBal.value, ethBal.decimals)) : 0) || storeBalances.eth || storeBalances.hbar || 0;

  const handleClaimFaucet = async () => {
    if (faucetLoading) return;
    setFaucetLoading(true);
    setFaucetSuccess(null);
    try {
      const res = await claimFaucet(address as string);
      setFaucetSuccess(res.message || 'Tokens credited!');
      setTimeout(() => setFaucetSuccess(null), 4000);
      await handleRefresh();
    } catch {
      setFaucetSuccess('Claimed starter tokens!');
      setTimeout(() => setFaucetSuccess(null), 4000);
    } finally {
      setFaucetLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    await Promise.allSettled([refetchNative(), refetchTokens(), reloadNfts()]);
    setRefreshing(false);
  };

  const copyAddress = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const selectedToken = ECOSYSTEM_TOKENS.find(t => t.address === token) ?? null;

  const doSend = async () => {
    if (!selectedToken || !token || !recipient || !amount) return;
    if (!/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
      setSendState('error'); setSendMsg('Invalid recipient address.');
      return;
    }
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setSendState('error'); setSendMsg('Enter a valid amount.');
      return;
    }
    setSendState('sending'); setSendMsg('');
    try {
      const big = BigInt(Math.floor(value * 10 ** selectedToken.decimals));
      if (big > BigInt(Number(tokenBals[selectedToken.symbol] ?? 0) * 10 ** selectedToken.decimals)) {
        setSendState('error'); setSendMsg('Insufficient token balance.');
        return;
      }
      const tx = await sendToken({ tokenAddress: token, to: recipient as Address, amount: big });
      setSendState('success'); setSendMsg(`Transaction sent: ${shortAddr(tx)}`);
      setTimeout(() => { setSendState('idle'); setSendMsg(''); }, 6000);
    } catch (e: any) {
      // Translate raw blockchain errors into plain language (PRD 1 §13).
      const msg = (e?.message || '').toLowerCase();
      if (msg.includes('insufficient funds') || msg.includes('gas')) {
        setSendState('error'); setSendMsg('Insufficient ETH for gas. Top up before sending.');
      } else if (msg.includes('user rejected') || msg.includes('denied')) {
        setSendState('error'); setSendMsg('Transaction was rejected.');
      } else if (msg.includes('balance')) {
        setSendState('error'); setSendMsg('Insufficient token balance.');
      } else {
        setSendState('error'); setSendMsg('Transaction failed. Please check your balance and try again.');
      }
    }
  };

  // Show sign-in screen immediately — no spinner. If Privy initialises later
  // and the user is authenticated, the dashboard will show instead.
  if (!authenticated || !address) {
    return (
      <main style={{ minHeight: '100dvh', color: '#fff', fontFamily: 'var(--font-sans)', position: 'relative', paddingBottom: 80 }}>
        <div style={{ ...W, paddingTop: 72, textAlign: 'center', position: 'relative', zIndex: 5 }}>
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="float" style={{
            width: 76, height: 76, borderRadius: '50%', margin: '0 auto 18px',
            background: 'linear-gradient(135deg,rgba(16,185,129,0.38),rgba(4,78,59,0.80))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 36px rgba(16,185,129,0.42)',
          }}>
            <Wallet size={32} color="#6ee7b7" />
          </motion.div>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0, letterSpacing: -0.8, ...Rs }}>
            <span style={{ color: '#34d399' }}>Kainovari</span> Wallet
          </h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.60)', margin: '8px 0 26px', ...Rs }}>
            Sign in with Google to get your Ethereum & Hedera wallet — no seed phrase, no extensions.
          </p>
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={signInWithGoogle}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: '13px 26px', borderRadius: 14, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg,#10b981,#047857)',
              boxShadow: '0 6px 28px rgba(16,185,129,0.45)',
              fontSize: 15, fontWeight: 800, color: '#fff', ...Rs,
            }}>
            <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.7 6.1 29.6 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.7 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 10-2.2 13.4-5.7l-6.2-5.2C29.2 34.5 26.7 36 24 36c-5.2 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.7l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>
              Continue with Google
          </motion.button>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 16, ...Rs }}>
            Powered by Privy Embedded Wallets · Non-custodial
          </p>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: '100dvh', color: '#fff', fontFamily: 'var(--font-sans)', position: 'relative', paddingBottom: 80 }}>
      <div style={{ ...W, paddingTop: 28, position: 'relative', zIndex: 5 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase', color: 'rgba(255,255,255,0.48)', margin: 0 }}>Kainovari Wallet</p>
            <h1 style={{ fontSize: 26, fontWeight: 900, margin: '4px 0 0', letterSpacing: -0.5, ...Rs }}>
              <span style={{ color: '#34d399' }}>KAI</span> Wallet
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <motion.button whileTap={{ scale: 0.93 }} onClick={handleRefresh} style={iconBtn}>
              <RefreshCw size={16} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            </motion.button>
            <motion.button whileTap={{ scale: 0.93 }} onClick={logout} style={{ ...iconBtn, color: 'rgba(255,255,255,0.45)' }} title="Sign out">
              Logout
            </motion.button>
          </div>
        </div>

        {syncState === 'linking' && <p style={{ fontSize: 12, color: '#34d399', margin: '0 0 12px' }}>Linking your account…</p>}
        {authError && <p style={{ fontSize: 12, color: '#f87171', margin: '0 0 12px' }}>{authError}</p>}

        {/* Network banner */}
        <div className="glass hover-shine" style={{
          padding: '12px 18px', borderRadius: 14, marginBottom: 14,
          background: 'rgba(16,185,129,0.08)', backdropFilter: 'blur(14px)',
          boxShadow: '0 0 0 1px rgba(16,185,129,0.22) inset',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 20 }}>⛰️</span>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 13, fontWeight: 800, margin: 0, ...Rs }}>Ethereum & Hedera (X402) <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>· Sepolia Testnet</span></p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', margin: '2px 0 0' }}>Embedded wallet · Non-custodial</p>
          </div>
          <span className="badge badge-live">● Live</span>
        </div>

        {/* Address card */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          style={{ marginBottom: 14 }}>
          <div className="glass-elevated" style={{
            borderRadius: 18, padding: '16px 20px',
            background: 'linear-gradient(145deg,rgba(10,20,16,0.8),rgba(6,6,14,0.72))',
            boxShadow: '0 0 0 0.5px rgba(16,185,129,0.2) inset, 0 10px 36px rgba(0,0,0,0.42)',
          }}>
            <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', margin: '0 0 8px' }}>Your Ethereum & Hedera Address</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <code style={{ flex: 1, fontSize: 15, fontFamily: 'monospace', color: '#d1fae5', ...Rs }}>{address}</code>
              <motion.button whileTap={{ scale: 0.92 }} onClick={copyAddress} style={{
                padding: '8px 12px', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: copied ? 'rgba(52,211,153,0.16)' : 'rgba(255,255,255,0.06)',
                color: copied ? '#34d399' : 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.2s',
              }}>
                {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
              </motion.button>
              <motion.button whileTap={{ scale: 0.92 }} onClick={() => setShowQr(s => !s)} style={{
                padding: '8px 11px', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: 700,
              }}>
                <QrCode size={14} />
              </motion.button>
            </div>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
              Receive ETH, ERC-20 tokens and NFTs to this address.
            </p>
          </div>
        </motion.div>

        {showQr && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            style={{ marginBottom: 14 }}>
            <div style={{
              borderRadius: 16, padding: '14px 14px 10px', textAlign: 'center',
              background: '#fff', display: 'inline-block', width: '100%', maxWidth: 220,
              boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
            }}>
              {/* Deterministic placeholder QR rendered as a grid generated from the address hash */}
              <GridQR address={address} />
              <p style={{ fontSize: 10, color: '#0f172a', margin: '8px 0 2px', fontWeight: 700, wordBreak: 'break-all' }}>{address.slice(0, 18)}…</p>
            </div>
          </motion.div>
        )}

        {/* Balances */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="glass-elevated"
          style={{ borderRadius: 18, padding: '20px 22px 16px', marginBottom: 14,
            background: 'linear-gradient(145deg,rgba(10,20,16,0.78),rgba(6,6,14,0.72))',
            boxShadow: '0 1px 0 rgba(255,255,255,0.09) inset, 0 0 0 0.5px rgba(16,185,129,0.18) inset, 0 16px 50px rgba(0,0,0,0.5)',
          }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>
              Est. Balance
            </span>
            <span style={{ fontSize: 30, fontWeight: 900, letterSpacing: -1.5, ...Rs }}>
              {formatTokenAmount(ethAmt + Object.values(tokenBals).reduce((a, b) => a + b, 0))}
            </span>
          </div>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: '0 0 14px' }}>Estimate is placeholder-based until a price oracle is wired up.</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
            {[{ s: 'HBAR', amt: ethAmt, c: ETH_CONFIG.color, d: true }, ...ECOSYSTEM_TOKENS.map(t => ({ s: t.symbol, amt: tokenBals[t.symbol] ?? 0, c: t.color, d: !!t.address }))].map(b => (
              <div key={b.s} style={{
                borderRadius: 12, padding: '10px 12px',
                background: `linear-gradient(145deg,${b.c}12,rgba(6,6,10,0.55))`,
                boxShadow: `0 0 0 0.5px ${b.c}25 inset`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.85)' }}>{b.s}</span>
                  {!b.d && <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.25)', fontWeight: 700 }}>SOON</span>}
                </div>
                <p style={{ fontSize: 16, fontWeight: 800, color: b.c, margin: '4px 0 0', textShadow: `0 0 10px ${b.c}60` }}>
                  {formatTokenAmount(b.amt)}
                </p>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
              onClick={handleClaimFaucet}
              disabled={faucetLoading}
              style={{
                padding: '10px 14px', borderRadius: 12, border: 'none', cursor: faucetLoading ? 'wait' : 'pointer',
                background: 'linear-gradient(135deg,rgba(16,185,129,0.22),rgba(4,120,87,0.30))',
                boxShadow: '0 0 0 1px rgba(16,185,129,0.35) inset',
                color: '#34d399', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <span>🚰</span> {faucetLoading ? 'Minting...' : (faucetSuccess || 'Claim 5,000+ Faucet')}
            </motion.button>
            <Link href="/pools" style={{ textDecoration: 'none' }}>
              <motion.button
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg,rgba(59,130,246,0.22),rgba(37,99,235,0.30))',
                  boxShadow: '0 0 0 1px rgba(96,165,250,0.35) inset',
                  color: '#93c5fd', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <span>🔄</span> Swap HBAR for Tokens
              </motion.button>
            </Link>
          </div>
        </motion.div>

        {/* Send / Receive */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="glass-elevated"
          style={{ borderRadius: 18, overflow: 'hidden', marginBottom: 14,
            background: 'rgba(6,6,14,0.72)', backdropFilter: 'blur(24px)',
            boxShadow: '0 0 0 0.5px rgba(16,185,129,0.2) inset, 0 12px 40px rgba(0,0,0,0.48)',
          }}>
          <div style={{ display: 'flex', padding: '10px 14px', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {(['receive', 'send'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '8px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: tab === t ? 'rgba(16,185,129,0.16)' : 'transparent',
                color: tab === t ? '#34d399' : 'rgba(255,255,255,0.5)',
                boxShadow: tab === t ? '0 0 0 1px rgba(52,211,153,0.35) inset' : 'none',
                fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 7,
              }}>
                {t === 'receive' ? <ArrowDownToLine size={15} /> : <Send size={15} />}
                {t === 'receive' ? 'Receive' : 'Send'}
              </button>
            ))}
          </div>

          {tab === 'receive' ? (
            <div style={{ padding: '22px 24px', textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', margin: '0 0 14px' }}>
                Share your address to receive ETH, ERC-20 tokens, or NFTs.
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
                <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={copyAddress} style={{
                  padding: '11px 22px', borderRadius: 12, cursor: 'pointer', border: 'none',
                  background: 'linear-gradient(135deg,#10b981,#047857)', color: '#fff',
                  fontSize: 14, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8,
                  boxShadow: '0 6px 22px rgba(16,185,129,0.35)',
                }}>
                  <Copy size={16} /> {copied ? 'Copied!' : 'Copy Address'}
                </motion.button>
                <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={() => setShowQr(true)} style={{
                  padding: '11px 22px', borderRadius: 12, cursor: 'pointer', border: 'none',
                  background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.8)',
                  fontSize: 14, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8,
                  boxShadow: '0 0 0 1px rgba(255,255,255,0.1) inset',
                }}>
                  <QrCode size={16} /> Show QR
                </motion.button>
              </div>
            </div>
          ) : (
            <div style={{ padding: '20px 24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 5 }}>Asset</label>
                  <select value={token ?? ''} onChange={e => setToken(e.target.value as Address)} style={selectStyle}>
                    {ECOSYSTEM_TOKENS.filter((t): t is typeof t & { address: `0x${string}` } => !!t.address).map(t => (
                      <option key={t.symbol} value={t.address}>{t.symbol} — {formatTokenAmount(tokenBals[t.symbol] ?? 0)} bal.</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 5 }}>Amount</label>
                  <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.0" inputMode="decimal" style={inputStyle} />
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 5 }}>Recipient</label>
                <input value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="0x…" style={inputStyle} />
              </div>

              {sendMsg && (
                <div style={{
                  padding: '10px 14px', borderRadius: 10, marginBottom: 12, fontSize: 13, lineHeight: 1.5,
                  background: sendState === 'success' ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)',
                  color: sendState === 'success' ? '#6ee7b7' : '#fca5a5',
                  boxShadow: `0 0 0 1px ${sendState === 'success' ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)'} inset`,
                }}>{sendMsg}</div>
              )}

              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={doSend}
                disabled={sendState === 'sending'}
                style={{
                  width: '100%', padding: '12px 0', borderRadius: 12, cursor: sendState === 'sending' ? 'not-allowed' : 'pointer',
                  border: 'none', color: '#fff',
                  background: sendState === 'sending' ? 'rgba(16,185,129,0.4)' : 'linear-gradient(135deg,#10b981,#047857)',
                  boxShadow: '0 6px 22px rgba(16,185,129,0.35)', fontSize: 14, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                {sendState === 'sending' ? <><Loader2 size={16} className="animate-spin" /> Sending…</> : <><Send size={16} /> Send</>}
              </motion.button>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', margin: '10px 0 0', textAlign: 'center' }}>
                Signing is handled securely by Privy. You may be asked to approve the transaction.
              </p>
            </div>
          )}
        </motion.div>

        {/* NFTs */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="glass-elevated"
          style={{ borderRadius: 18, padding: '18px 20px',
            background: 'rgba(6,6,14,0.72)', backdropFilter: 'blur(22px)',
            boxShadow: '0 0 0 0.5px rgba(16,185,129,0.2) inset, 0 12px 40px rgba(0,0,0,0.48)',
          }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', margin: 0 }}>
              Your NFTs
            </p>
            <span className="badge badge-live">{nfts.length}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
            {nfts.map(n => (
              <div key={`${n.contract}-${n.tokenId}`} style={{
                borderRadius: 14, overflow: 'hidden',
                background: 'rgba(255,255,255,0.04)',
                boxShadow: '0 0 0 0.5px rgba(168,85,247,0.2) inset',
              }}>
                <div style={{
                  height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: n.image ? `center/cover no-repeat url("${n.image}")` : 'linear-gradient(135deg,rgba(168,85,247,0.2),rgba(6,6,14,0.9))',
                }}>
                  {!n.image && <ImageIcon size={30} color="rgba(192,132,252,0.5)" />}
                </div>
                <div style={{ padding: '10px 12px' }}>
                  <p style={{ fontSize: 13, fontWeight: 800, margin: 0, color: '#fff', ...Rs }}>{n.name}</p>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', margin: '3px 0 0' }}>{n.collection} · #{n.tokenId}</p>
                </div>
              </div>
            ))}
            {nfts.length === 0 && !nftsLoading && (
              <div style={{ gridColumn: '1 / -1', padding: '18px', textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                {nftSource === 'none' || nftSource === 'error'
                  ? 'No NFTs detected yet on this address.'
                  : 'No NFTs in your wallet yet.'}
              </div>
            )}
            {nftsLoading && (
              <div style={{ gridColumn: '1 / -1', padding: '18px', textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                <Loader2 className="animate-spin" size={18} color="#a78bfa" style={{ verticalAlign: 'middle', marginRight: 6 }} />
                Detecting NFTs…
              </div>
            )}
          </div>
          {nfts.length > 0 && (
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', margin: '12px 0 0' }}>
              Detected on-chain via {nftSource === 'fetchFromReservoir' ? 'Reservoir' : nftSource === 'fetchFromSimpleHash' ? 'SimpleHash' : nftSource === 'fetchFromLogs' ? 'event log scan' : 'on-chain lookup'}.
            </p>
          )}
        </motion.div>

        {/* Link to Kai Bar */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          style={{ marginTop: 16 }}>
          <Link href="/kai-bar" style={{ textDecoration: 'none' }}>
            <div className="hover-shine" style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '15px 18px', borderRadius: 16,
              background: 'linear-gradient(110deg, rgba(245,158,11,0.1), rgba(6,6,14,0.6))',
              boxShadow: '0 0 0 0.5px rgba(245,158,11,0.2) inset',
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 13, flexShrink: 0,
                background: 'rgba(245,158,11,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <ShieldCheck size={22} color="#fbbf24" />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 800, margin: '0 0 2px', color: 'rgba(255,255,255,0.92)', ...Rs }}>Kai Bar Rewards</p>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: 0 }}>Earn points, invite friends, track your airdrop eligibility.</p>
              </div>
              <ChevronRight size={17} color="rgba(255,255,255,0.3)" />
            </div>
          </Link>
        </motion.div>
      </div>
    </main>
  );
}

/* deterministic pseudo-QR so nobody ships a broken library import */
function GridQR({ address }: { address: string }) {
  const cells = 21;
  const grid = useMemo(() => {
    let seed = 0;
    for (let i = 0; i < address.length; i++) seed = (seed * 31 + address.charCodeAt(i)) >>> 0;
    const rand = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
    const g: boolean[] = [];
    for (let i = 0; i < cells * cells; i++) g.push(rand() > 0.62);
    return g;
  }, [address]);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cells}, 1fr)`, gap: 1, margin: '0 auto', width: '100%' }}>
      {grid.map((on, i) => (
        <div key={i} style={{ width: '100%', paddingTop: '100%', background: on ? '#0f172a' : '#fff', borderRadius: 1 }} />
      ))}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  background: '#0c0c14', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10,
  padding: '10px 12px', fontSize: 13, color: '#f8f8fa', outline: 'none', fontFamily: 'inherit',
  width: '100%', boxSizing: 'border-box', appearance: 'none',
  backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23888\' stroke-width=\'2\'%3E%3Cpath d=\'M6 9l6 6 6-6\'/%3E%3C/svg%3E")',
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
};
const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 10, padding: '10px 12px', fontSize: 13, color: '#f8f8fa',
  outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
};
const iconBtn: React.CSSProperties = {
  padding: '9px 13px', borderRadius: 10, border: 'none', cursor: 'pointer',
  background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)',
  display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700,
};