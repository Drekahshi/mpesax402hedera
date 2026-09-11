'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Users, TrendingUp, Lock, Gift, BarChart3,
  Vote, ExternalLink, RefreshCw, ChevronRight,
  Zap, Coins, Activity, CheckCircle, Clock, AlertCircle,
  Shield,
} from 'lucide-react';

interface SavingData {
  chama: {
    groupName: string; registrationNumber: string; cyclePeriodDays: number;
    contributionAmount: number; totalPoolBalanceKes: number;
    yieldAllocatedKes: number; activeVaultStrategy: string; groupWallet: string;
  };
  stats: {
    totalMembers: number; totalPoolKes: number; yieldEarnedKes: number;
    bestApyPercent: number; activePools: number; cycleNumber: number; nextPayoutDays: number;
  };
  members: { id: string; name: string; role: string; totalContributed: number; sharePercent: number; phone: string }[];
  recentContributions: { memberName: string; amountKes: number; paymentRef: string; status: string; timestamp: string }[];
  yieldLogs: { id: string; amountInvested: number; yieldEarnedKes: number; strategyUsed: string; txHash: string; generatedAt: string }[];
  vaultStrategies: { key: string; label: string; apy: number; risk: string; color: string; token: string; desc: string }[];
  pools: { name: string; icon: string; apy: string; tvl: string; members: number; color: string }[];
  monthlyYield: { month: string; yieldKes: number }[];
}

const ROLE_COLOR: Record<string, string> = {
  CHAIRPERSON: '#10b981',
  TREASURER:   '#f59e0b',
  SECRETARY:   '#3b82f6',
  MEMBER:      '#a855f7',
};

const STRATEGY_LABEL: Record<string, string> = {
  BALANCED_YBOB_VAULT:     'Balanced yBOB',
  CONSERVATIVE_KES_STABLE: 'Conservative KES',
  HIGH_YIELD_ETH_POOL:    'High Yield ETH',
};

function YieldBar({ data }: { data: { month: string; yieldKes: number }[] }) {
  const max = Math.max(...data.map(d => d.yieldKes));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 68 }}>
      {data.map((d, i) => {
        const pct = Math.round((d.yieldKes / max) * 56);
        const isLast = i === data.length - 1;
        return (
          <div key={d.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <div style={{
              width: '100%', borderRadius: '4px 4px 2px 2px', height: `${pct}px`, minHeight: 4,
              background: isLast
                ? 'linear-gradient(180deg,#34d399,#10b981)'
                : 'linear-gradient(180deg,#a855f7,#7c3aed)',
              boxShadow: isLast ? '0 0 8px rgba(16,185,129,0.40)' : 'none',
            }} />
            <p style={{ fontSize: 8, color: isLast ? '#10b981' : 'rgba(248,248,250,0.35)', margin: 0, fontWeight: isLast ? 800 : 600 }}>{d.month}</p>
          </div>
        );
      })}
    </div>
  );
}

export default function SavingGroupPage() {
  const [data, setData]   = useState<SavingData | null>(null);
  const [loading, setLoad]= useState(true);
  const [tab, setTab]     = useState<'overview' | 'members' | 'yield' | 'pools'>('overview');

  const load = async () => {
    setLoad(true);
    try { const r = await fetch('/api/saving/stats'); setData(await r.json()); }
    catch { /* offline */ }
    finally { setLoad(false); }
  };
  useEffect(() => { load(); }, []);

  if (loading) return (
    <div style={{ minHeight: '100dvh', background: '#08080a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg,#a855f7,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Users size={26} color="#fff" />
      </div>
      <p style={{ color: 'rgba(248,248,250,0.45)', fontSize: 13, fontWeight: 600 }}>Loading Chama data…</p>
    </div>
  );

  const d = data!;
  const totalPool    = d.stats.totalPoolKes;
  const yieldPct     = (d.stats.yieldEarnedKes / totalPool) * 100;
  const activeStrategy = d.vaultStrategies.find(v => v.key === d.chama.activeVaultStrategy) ?? d.vaultStrategies[1];

  return (
    <main style={{ minHeight: '100dvh', background: 'radial-gradient(ellipse 80% 50% at 50% -5%, rgba(168,85,247,0.12) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 10% 100%, rgba(232,65,66,0.06) 0%, transparent 55%), #08080a', color: '#f8f8fa', paddingBottom: 96, fontFamily: 'var(--font-sans)' }}>

      {/* ── HERO ── */}
      <div style={{ padding: '22px 18px 0', background: 'linear-gradient(180deg, rgba(168,85,247,0.09) 0%, transparent 100%)', borderBottom: '1px solid rgba(168,85,247,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <Link href="/" style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(168,85,247,0.10)', border: '1px solid rgba(168,85,247,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', flexShrink: 0 }}>
            <ArrowLeft size={17} color="#a855f7" />
          </Link>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 17, fontWeight: 900, margin: '0 0 2px', letterSpacing: -0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.chama.groupName}</h1>
            <p style={{ fontSize: 10, color: 'rgba(248,248,250,0.42)', margin: 0 }}>Reg: {d.chama.registrationNumber} · Cycle #{d.stats.cycleNumber}</p>
          </div>
          <button onClick={load} style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <RefreshCw size={13} color="rgba(255,255,255,0.40)" />
          </button>
        </div>

        {/* Big pool card */}
        <div style={{ marginBottom: 16, borderRadius: 22, padding: '20px 18px', background: 'linear-gradient(135deg, rgba(168,85,247,0.16) 0%, rgba(124,58,237,0.10) 50%, rgba(10,10,12,0.95) 100%)', border: '1.5px solid rgba(168,85,247,0.30)', position: 'relative', overflow: 'hidden', boxShadow: '0 8px 32px rgba(168,85,247,0.10)' }}>
          <div style={{ position: 'absolute', top: -40, right: -40, width: 130, height: 130, borderRadius: '50%', background: 'radial-gradient(circle, rgba(168,85,247,0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, rgba(168,85,247,0.60), transparent)' }} />

          <p style={{ fontSize: 9, color: 'rgba(248,248,250,0.38)', fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', margin: '0 0 4px' }}>Total Pool Balance</p>
          <p style={{ fontSize: 36, fontWeight: 900, color: '#f8f8fa', margin: '0 0 4px', letterSpacing: -2 }}>
            KES {totalPool.toLocaleString()}
          </p>
          <p style={{ fontSize: 12, color: '#c084fc', fontWeight: 700, margin: '0 0 14px' }}>
            + KES {d.stats.yieldEarnedKes.toLocaleString()} yield ({yieldPct.toFixed(1)}% earned)
          </p>

          {/* progress bar */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 9, color: '#c084fc', fontWeight: 700 }}>Yield earned</span>
              <span style={{ fontSize: 9, color: 'rgba(248,248,250,0.38)', fontWeight: 600 }}>Target: KES 50K</span>
            </div>
            <div style={{ height: 8, background: 'rgba(255,255,255,0.07)', borderRadius: 4 }}>
              <div style={{ height: '100%', width: `${Math.min(100, Math.round((d.stats.yieldEarnedKes / 50000) * 100))}%`, borderRadius: 4, background: 'linear-gradient(90deg,#10b981,#a855f7,#c084fc)', boxShadow: '0 0 8px rgba(168,85,247,0.40)', transition: 'width 0.7s ease' }} />
            </div>
          </div>

          {/* active strategy badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ padding: '6px 12px', borderRadius: 10, background: `${activeStrategy.color}18`, border: `1px solid ${activeStrategy.color}35`, display: 'flex', alignItems: 'center', gap: 7 }}>
              <Shield size={11} color={activeStrategy.color} />
              <span style={{ fontSize: 10, fontWeight: 800, color: activeStrategy.color }}>{activeStrategy.label} - {activeStrategy.apy}% APY</span>
            </div>
            <div style={{ padding: '5px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontSize: 9, color: 'rgba(248,248,250,0.42)', fontWeight: 700 }}>{d.stats.nextPayoutDays}d to payout</span>
            </div>
          </div>
        </div>

        {/* KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 9, marginBottom: 16 }}>
          {[
            { label: 'Members',     value: d.stats.totalMembers.toString(), color: '#a855f7', icon: <Users size={16} color="#a855f7" strokeWidth={1.8} /> },
            { label: 'Best APY',    value: `${d.stats.bestApyPercent}%`,     color: '#22c55e', icon: <TrendingUp size={16} color="#22c55e" strokeWidth={1.8} /> },
            { label: 'Active Pools', value: d.stats.activePools.toString(),  color: '#3b82f6', icon: <BarChart3 size={16} color="#3b82f6" strokeWidth={1.8} /> },
          ].map(s => (
            <div key={s.label} style={{ borderRadius: 16, padding: '12px 10px', textAlign: 'center', background: `linear-gradient(145deg, ${s.color}08 0%, rgba(10,10,12,0.88) 100%)`, border: `1px solid ${s.color}22`, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${s.color}45, transparent)` }} />
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>{s.icon}</div>
              <p style={{ fontSize: 18, fontWeight: 900, color: s.color, margin: '0 0 2px', letterSpacing: -0.5 }}>{s.value}</p>
              <p style={{ fontSize: 8, color: 'rgba(248,248,250,0.35)', fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase', margin: 0 }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 1 }}>
          {(['overview', 'members', 'yield', 'pools'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flexShrink: 0, padding: '7px 14px', borderRadius: '10px 10px 0 0', cursor: 'pointer', border: 'none',
              background: tab === t ? 'rgba(168,85,247,0.14)' : 'rgba(255,255,255,0.03)',
              borderTop: tab === t ? '1.5px solid rgba(168,85,247,0.50)' : '1.5px solid transparent',
              color: tab === t ? '#c084fc' : 'rgba(248,248,250,0.38)',
              fontSize: 11, fontWeight: tab === t ? 800 : 600, textTransform: 'capitalize', transition: 'all 0.18s',
            }}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: '18px 18px 0' }}>

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* yield bar chart */}
            <section>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <p className="label-caps">Monthly Yield Earned</p>
                <span style={{ fontSize: 9, color: '#10b981', fontWeight: 700 }}>■ Latest month highlighted</span>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '14px 12px 8px' }}>
                <YieldBar data={d.monthlyYield} />
              </div>
            </section>

            {/* vault strategies */}
            <section>
              <p className="label-caps" style={{ marginBottom: 12 }}>Vault Strategies</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {d.vaultStrategies.map(v => {
                  const isActive = v.key === d.chama.activeVaultStrategy;
                  return (
                    <div key={v.key} style={{ borderRadius: 16, padding: '14px 15px', background: isActive ? `linear-gradient(135deg, ${v.color}12 0%, rgba(10,10,12,0.90) 100%)` : 'rgba(255,255,255,0.025)', border: `1.5px solid ${isActive ? v.color + '40' : 'rgba(255,255,255,0.07)'}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <div style={{ width: 36, height: 36, borderRadius: 11, background: `${v.color}14`, border: `1.5px solid ${v.color}35`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Shield size={17} color={v.color} strokeWidth={1.8} />
                          </div>
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 800, color: '#f8f8fa', margin: '0 0 2px' }}>{v.label}</p>
                            <p style={{ fontSize: 10, color: 'rgba(248,248,250,0.40)', margin: 0 }}>{v.desc}</p>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontSize: 22, fontWeight: 900, color: v.color, margin: '0 0 2px', letterSpacing: -0.8 }}>{v.apy}%</p>
                          <p style={{ fontSize: 8, color: 'rgba(248,248,250,0.35)', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', margin: 0 }}>APY</p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 5, background: 'rgba(255,255,255,0.06)', color: 'rgba(248,248,250,0.45)', fontWeight: 700 }}>Risk: {v.risk}</span>
                        {isActive && <span style={{ fontSize: 9, padding: '2px 9px', borderRadius: 5, background: `${v.color}18`, color: v.color, border: `1px solid ${v.color}35`, fontWeight: 800 }}>✓ Active Strategy</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* recent contributions */}
            <section>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <p className="label-caps">Recent Contributions</p>
                <button onClick={() => setTab('members')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a855f7', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
                  All members <ChevronRight size={10} />
                </button>
              </div>
              <div className="glass" style={{ borderRadius: 16, overflow: 'hidden' }}>
                {d.recentContributions.slice(0, 4).map((c, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 15px', borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {c.status === 'SUCCESS'
                        ? <CheckCircle size={14} color="#4ade80" />
                        : <Clock size={14} color="#fbbf24" />}
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 700, color: '#f8f8fa', margin: '0 0 1px' }}>{c.memberName}</p>
                        <p style={{ fontSize: 9, color: 'rgba(248,248,250,0.35)', margin: 0, fontFamily: 'monospace' }}>{c.paymentRef}</p>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: 13, fontWeight: 900, color: '#4ade80', margin: '0 0 2px' }}>+KES {c.amountKes.toLocaleString()}</p>
                      <p style={{ fontSize: 9, color: 'rgba(248,248,250,0.35)', margin: 0 }}>{new Date(c.timestamp).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* ── MEMBERS ── */}
        {tab === 'members' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <p className="label-caps">Members ({d.members.length})</p>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#a855f7' }}>
                KES {d.chama.contributionAmount.toLocaleString()} / cycle
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {d.members.map((m, i) => {
                const rc = ROLE_COLOR[m.role] ?? '#a855f7';
                const barW = Math.min(100, Math.round((m.totalContributed / 40000) * 100));
                return (
                  <div key={m.id} style={{ borderRadius: 18, padding: '15px 16px', background: `linear-gradient(135deg, ${rc}07 0%, rgba(10,10,12,0.90) 100%)`, border: `1px solid ${rc}20` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                      {/* rank + avatar */}
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <div style={{ width: 44, height: 44, borderRadius: '50%', background: `linear-gradient(135deg,${rc}28,${rc}10)`, border: `1.5px solid ${rc}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 900, color: rc }}>
                          {m.name.charAt(0)}
                        </div>
                        <div style={{ position: 'absolute', bottom: -2, right: -2, width: 16, height: 16, borderRadius: '50%', background: '#08080a', border: `1px solid ${rc}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 900, color: rc }}>
                          {i+1}
                        </div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                          <p style={{ fontSize: 13, fontWeight: 800, color: '#f8f8fa', margin: 0 }}>{m.name}</p>
                          <span style={{ fontSize: 8, fontWeight: 800, padding: '2px 7px', borderRadius: 5, background: `${rc}18`, color: rc, border: `1px solid ${rc}30`, letterSpacing: 0.4, textTransform: 'uppercase' }}>{m.role}</span>
                        </div>
                        <p style={{ fontSize: 10, color: 'rgba(248,248,250,0.38)', margin: 0 }}>
                          {m.sharePercent}% share · {m.phone}
                        </p>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <p style={{ fontSize: 14, fontWeight: 900, color: '#4ade80', margin: '0 0 2px', letterSpacing: -0.3 }}>KES {(m.totalContributed/1000).toFixed(0)}K</p>
                        <p style={{ fontSize: 9, color: 'rgba(248,248,250,0.35)', margin: 0 }}>contributed</p>
                      </div>
                    </div>
                    {/* contribution bar */}
                    <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
                      <div style={{ height: '100%', width: `${barW}%`, borderRadius: 3, background: `linear-gradient(90deg, ${rc}, ${rc}88)`, transition: 'width 0.6s ease' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── YIELD LOGS ── */}
        {tab === 'yield' && (
          <div>
            <p className="label-caps" style={{ marginBottom: 6 }}>Vault Yield History</p>
            <p style={{ fontSize: 11, color: 'rgba(248,248,250,0.42)', marginBottom: 14, lineHeight: 1.5 }}>
              Monthly returns auto-routed from Nuvari vaults back to the group pool.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {d.yieldLogs.map(y => {
                const strat = d.vaultStrategies.find(v => v.key === y.strategyUsed);
                const color = strat?.color ?? '#a855f7';
                const roi   = ((y.yieldEarnedKes / y.amountInvested) * 100).toFixed(2);
                return (
                  <div key={y.id} style={{ borderRadius: 18, padding: '16px 16px', background: `linear-gradient(135deg, ${color}08 0%, rgba(10,10,12,0.92) 100%)`, border: `1px solid ${color}22`, position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${color}55, transparent)` }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <div>
                        <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(248,248,250,0.40)', margin: '0 0 3px' }}>{y.generatedAt}</p>
                        <p style={{ fontSize: 13, fontWeight: 800, color: '#f8f8fa', margin: 0 }}>{STRATEGY_LABEL[y.strategyUsed] ?? y.strategyUsed}</p>
                      </div>
                      <p style={{ fontSize: 24, fontWeight: 900, color: '#4ade80', margin: 0, letterSpacing: -1 }}>
                        +KES {y.yieldEarnedKes.toLocaleString()}
                      </p>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                      {[
                        { label: 'Invested',  value: `KES ${(y.amountInvested/1000).toFixed(0)}K`, color: '#f8f8fa' },
                        { label: 'ROI',       value: `${roi}%`,                                     color: '#4ade80' },
                        { label: 'Strategy',  value: strat?.risk ?? '-',                            color },
                      ].map(s => (
                        <div key={s.label} style={{ textAlign: 'center', padding: '9px 5px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <p style={{ fontSize: 12, fontWeight: 900, color: s.color, margin: '0 0 2px' }}>{s.value}</p>
                          <p style={{ fontSize: 8, color: 'rgba(248,248,250,0.35)', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', margin: 0 }}>{s.label}</p>
                        </div>
                      ))}
                    </div>
                    {y.txHash && (
                      <div style={{ padding: '7px 10px', borderRadius: 9, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 9, color: 'rgba(248,248,250,0.38)', fontFamily: 'monospace' }}>tx: {y.txHash}</span>
                        <a href={`https://sepolia.etherscan.io/tx/${y.txHash}`} target="_blank" rel="noreferrer" style={{ fontSize: 9, color: '#10b981', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>
                          Etherscan <ExternalLink size={9} />
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── POOLS ── */}
        {tab === 'pools' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <p className="label-caps">Liquidity Pools</p>
              <Link href="/pools" style={{ fontSize: 10, color: '#a855f7', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>
                Add Liquidity <ExternalLink size={10} />
              </Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {d.pools.map(p => (
                <div key={p.name} className="glass" style={{ borderRadius: 18, padding: '15px 16px', borderColor: `${p.color}22`, background: `linear-gradient(90deg, ${p.color}07 0%, rgba(10,10,12,0.88) 100%)` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <span style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>{p.icon}</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 14, fontWeight: 900, color: '#f8f8fa', margin: '0 0 3px' }}>{p.name}</p>
                      <p style={{ fontSize: 10, color: 'rgba(248,248,250,0.40)', margin: 0 }}>
                        TVL: <span style={{ color: 'rgba(248,248,250,0.65)', fontWeight: 700 }}>{p.tvl}</span> · {p.members} LPs
                      </p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: 24, fontWeight: 900, color: p.color, margin: '0 0 2px', letterSpacing: -0.8 }}>{p.apy}</p>
                      <p style={{ fontSize: 9, color: 'rgba(248,248,250,0.35)', fontWeight: 600, margin: 0 }}>Fee yield</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="divider-green" style={{ margin: '20px 0' }} />

            <p className="label-caps" style={{ marginBottom: 12 }}>Group Products</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'Micro Pension',  href: '/securities', icon: Lock,    color: '#8b5cf6', desc: '12.8% APY' },
                { label: 'Group Pool',     href: '/pools',      icon: Users,   color: '#a855f7', desc: 'Add LP'    },
                { label: 'Daily Airdrop',  href: '/mine',       icon: Gift,    color: '#f59e0b', desc: 'Free NVR'  },
                { label: 'DAO Vote',       href: '/nuvari',     icon: Vote,    color: '#10b981', desc: 'NVR power' },
              ].map(l => (
                <Link key={l.label} href={l.href} style={{ textDecoration: 'none' }}>
                  <div className="glass" style={{ borderRadius: 14, padding: '15px 13px', borderColor: `${l.color}22`, background: `linear-gradient(135deg, ${l.color}07 0%, rgba(10,10,12,0.88) 100%)` }}>
                    <l.icon size={20} color={l.color} strokeWidth={1.8} style={{ marginBottom: 9, display: 'block' }} />
                    <p style={{ fontSize: 13, fontWeight: 800, color: '#f8f8fa', margin: '0 0 3px' }}>{l.label}</p>
                    <p style={{ fontSize: 11, color: l.color, margin: 0, fontWeight: 700 }}>{l.desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
