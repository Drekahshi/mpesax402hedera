'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Trees, Users, Leaf, TrendingUp, ShieldCheck,
  FileText, Globe, ExternalLink, Vote, MapPin, Clock,
  AlertTriangle, CheckCircle, Activity, Coins, RefreshCw,
  ChevronRight, Zap,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────
interface CFAData {
  forest: {
    name: string; did: string; locationRegion: string;
    establishedAt: string; totalHectares: number;
    carbonCredits: number; treasuryWallet: string;
  };
  stats: {
    totalMembers: number; activeZones: number; treesPlanted: number;
    patrols30d: number; carbonCreditsEarned: number;
    treasuryTvlKes: number; proposalsActive: number;
  };
  members: { id: string; name: string; role: string; wallet: string | null; patrols: number; joinedAt: string }[];
  zones: { id: string; zoneName: string; areaHa: number; treeCount: number; status: string }[];
  recentPatrols: { id: string; memberName: string; zone: string; durationMins: number; treesPlanted: number; status: string; patrolDate: string; incidentType?: string }[];
  products: { id: string; name: string; category: string; apyPercent: number; token: string; status: string; memberCount: number; tvlKes: number }[];
  proposals: { id: string; proposalRef: string; title: string; votesFor: number; votesAgainst: number; status: string; deadline: string }[];
  monthlyTrend: { month: string; trees: number; patrols: number }[];
}

const ZONE_COLOR: Record<string, { color: string; icon: string }> = {
  PROTECTED:    { color: '#22c55e', icon: '' },
  ACTIVE:       { color: '#3b82f6', icon: '' },
  RESTORED:     { color: '#a855f7', icon: '' },
  UNDER_THREAT: { color: '#10b981', icon: '' },
};

const ROLE_COLOR: Record<string, string> = {
  ADMIN:     '#10b981',
  TREASURER: '#f59e0b',
  AUDITOR:   '#a855f7',
  GUARDIAN:  '#22c55e',
};

function KPICard({ icon, value, label, color, sub }: { icon: React.ReactNode; value: string; label: string; color: string; sub?: string }) {
  return (
    <div style={{
      borderRadius: 18, padding: '16px 14px', textAlign: 'center',
      background: `linear-gradient(145deg, ${color}10 0%, rgba(10,10,12,0.92) 100%)`,
      border: `1px solid ${color}28`, position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${color}60, transparent)` }} />
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>{icon}</div>
      <p style={{ fontSize: 22, fontWeight: 900, color, margin: '0 0 3px', letterSpacing: -1 }}>{value}</p>
      <p style={{ fontSize: 9, color: 'rgba(248,248,250,0.40)', margin: sub ? '0 0 2px' : 0, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase' }}>{label}</p>
      {sub && <p style={{ fontSize: 10, color, fontWeight: 700, margin: 0 }}>{sub}</p>}
    </div>
  );
}

// Mini bar chart
function MiniBar({ data, colorA, colorB }: { data: { month: string; trees: number; patrols: number }[]; colorA: string; colorB: string }) {
  const maxTrees = Math.max(...data.map(d => d.trees));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 64, padding: '0 4px' }}>
      {data.map(d => (
        <div key={d.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <div style={{
            width: '100%', borderRadius: '4px 4px 2px 2px',
            height: `${Math.round((d.trees / maxTrees) * 52)}px`,
            background: `linear-gradient(180deg, ${colorA} 0%, ${colorA}88 100%)`,
            minHeight: 4,
          }} />
          <p style={{ fontSize: 8, color: 'rgba(248,248,250,0.35)', margin: 0, fontWeight: 700 }}>{d.month}</p>
        </div>
      ))}
    </div>
  );
}

export default function CFAPage() {
  const [data, setData]       = useState<CFAData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState<'overview' | 'members' | 'patrol' | 'products' | 'gov'>('overview');

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/cfa/stats');
      setData(await r.json());
    } catch { /* offline — data stays null */ }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  if (loading) return (
    <div style={{ minHeight: '100dvh', background: '#08080a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg,#10b981,#064e3b)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Trees size={26} color="#fff" />
      </div>
      <p style={{ color: 'rgba(248,248,250,0.45)', fontSize: 13, fontWeight: 600 }}>Loading CFA data...</p>
    </div>
  );

  const d = data!;
  const totalVotes = (p: typeof d.proposals[0]) => p.votesFor + p.votesAgainst;

  return (
    <main style={{ minHeight: '100dvh', background: 'radial-gradient(ellipse 80% 50% at 10% -5%, rgba(16,185,129,0.12) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 90% 100%, rgba(34,197,94,0.06) 0%, transparent 55%), #08080a', color: '#f8f8fa', paddingBottom: 96, fontFamily: 'var(--font-sans)' }}>

      {/* ── HERO HEADER ── */}
      <div style={{ padding: '22px 18px 0', background: 'linear-gradient(180deg, rgba(16,185,129,0.09) 0%, transparent 100%)', borderBottom: '1px solid rgba(16,185,129,0.14)' }}>
        {/* back + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <Link href="/" style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', flexShrink: 0 }}>
            <ArrowLeft size={17} color="#10b981" />
          </Link>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <div style={{ width: 38, height: 38, borderRadius: 13, background: 'linear-gradient(135deg,rgba(16,185,129,0.30),rgba(5,150,105,0.18))', border: '1.5px solid rgba(16,185,129,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 18px rgba(16,185,129,0.22)', flexShrink: 0 }}>
                <Trees size={20} color="#10b981" strokeWidth={1.8} />
              </div>
              <div>
                <h1 style={{ fontSize: 18, fontWeight: 900, margin: 0, letterSpacing: -0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.forest.name}</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 1 }}>
                  <MapPin size={10} color="rgba(248,248,250,0.38)" />
                  <p style={{ fontSize: 10, color: 'rgba(248,248,250,0.42)', margin: 0 }}>{d.forest.locationRegion}</p>
                </div>
              </div>
            </div>
          </div>
          <button onClick={load} style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <RefreshCw size={13} color="rgba(255,255,255,0.40)" />
          </button>
        </div>

        {/* DID + wallet strip */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', scrollbarWidth: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.18)', flexShrink: 0 }}>
            <ShieldCheck size={10} color="#10b981" />
            <span style={{ fontSize: 9, fontWeight: 800, color: '#10b981', fontFamily: 'monospace' }}>{d.forest.did}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.18)', flexShrink: 0 }}>
            <Coins size={10} color="#4ade80" />
            <span style={{ fontSize: 9, fontWeight: 700, color: '#4ade80', fontFamily: 'monospace' }}>{d.forest.treasuryWallet.slice(0, 18)}…</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
            <Clock size={10} color="rgba(248,248,250,0.38)" />
            <span style={{ fontSize: 9, fontWeight: 600, color: 'rgba(248,248,250,0.45)' }}>Est. {new Date(d.forest.establishedAt).getFullYear()}</span>
          </div>
        </div>

        {/* 6 KPI cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 9, marginBottom: 16 }}>
          <KPICard icon={<Users size={18} color="#10b981" strokeWidth={1.8} />}    value={d.stats.totalMembers.toLocaleString()}              label="Members"      color="#10b981" />
          <KPICard icon={<Trees size={18} color="#22c55e" strokeWidth={1.8} />}    value={(d.stats.treesPlanted/1000).toFixed(1)+'K'}          label="Trees"        color="#22c55e" />
          <KPICard icon={<Leaf size={18} color="#a855f7" strokeWidth={1.8} />}     value={d.stats.carbonCreditsEarned.toLocaleString()}       label="Carbon Cr."   color="#a855f7" />
          <KPICard icon={<Activity size={18} color="#3b82f6" strokeWidth={1.8} />} value={d.stats.patrols30d.toString()}                       label="Patrols/30d"  color="#3b82f6" />
          <KPICard icon={<TrendingUp size={18} color="#f59e0b" strokeWidth={1.8} />} value={'KES '+Math.round(d.stats.treasuryTvlKes/1000)+'K'} label="Treasury"    color="#f59e0b" />
          <KPICard icon={<Vote size={18} color="#06b6d4" strokeWidth={1.8} />}     value={d.stats.proposalsActive.toString()}                  label="Active DAO"   color="#06b6d4" />
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 1 }}>
          {(['overview','members','patrol','products','gov'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flexShrink: 0, padding: '7px 14px', borderRadius: '10px 10px 0 0', cursor: 'pointer', border: 'none',
              background: tab === t ? 'rgba(16,185,129,0.14)' : 'rgba(255,255,255,0.03)',
              borderTop: tab === t ? '1.5px solid rgba(16,185,129,0.45)' : '1.5px solid transparent',
              color: tab === t ? '#10b981' : 'rgba(248,248,250,0.38)',
              fontSize: 11, fontWeight: tab === t ? 800 : 600, letterSpacing: 0.2, textTransform: 'capitalize',
              transition: 'all 0.18s',
            }}>{t === 'gov' ? 'DAO' : t === 'patrol' ? 'Patrols' : t.charAt(0).toUpperCase() + t.slice(1)}</button>
          ))}
        </div>
      </div>

      {/* ── TAB CONTENT ── */}
      <div style={{ padding: '18px 18px 0' }}>

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Monthly bar chart */}
            <section>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <p className="label-caps">Monthly Trees Planted</p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <span style={{ fontSize: 9, color: '#10b981', fontWeight: 700 }}>■ Trees</span>
                </div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '14px 12px 8px' }}>
                <MiniBar data={d.monthlyTrend} colorA="#10b981" colorB="#22c55e" />
              </div>
            </section>

            {/* Zones grid */}
            <section>
              <p className="label-caps" style={{ marginBottom: 12 }}>Forest Zones</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {d.zones.map(z => {
                  const zc = ZONE_COLOR[z.status] ?? { color: '#3b82f6', icon: '🌳' };
                  const pct = Math.min(100, Math.round((z.treeCount / 5000) * 100));
                  return (
                    <div key={z.id} style={{ borderRadius: 16, padding: '13px 15px', background: `linear-gradient(90deg, ${zc.color}08 0%, rgba(10,10,12,0.90) 100%)`, border: `1px solid ${zc.color}22`, position: 'relative', overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <span style={{ fontSize: 18, lineHeight: 1 }}>{zc.icon}</span>
                        <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 800, color: '#f8f8fa', margin: '0 0 2px' }}>{z.zoneName}</p>
                  <p style={{ fontSize: 10, color: 'rgba(248,248,250,0.40)', margin: 0 }}>{z.areaHa} ha - {z.treeCount.toLocaleString()} trees</p>
                        </div>
                        <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 6, background: `${zc.color}18`, color: zc.color, border: `1px solid ${zc.color}35`, letterSpacing: 0.3 }}>{z.status.replace('_',' ')}</span>
                      </div>
                      {/* progress bar */}
                      <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 2, background: `linear-gradient(90deg, ${zc.color}, ${zc.color}88)`, transition: 'width 0.6s ease' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Latest patrol snapshot */}
            <section>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <p className="label-caps">Latest Patrol</p>
                <button onClick={() => setTab('patrol')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#10b981', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
                  See all <ChevronRight size={10} />
                </button>
              </div>
              {d.recentPatrols.slice(0, 2).map(p => (
                <div key={p.id} style={{ marginBottom: 8, borderRadius: 14, padding: '12px 14px', background: p.status === 'FLAGGED' ? 'rgba(16,185,129,0.07)' : 'rgba(255,255,255,0.03)', border: `1px solid ${p.status === 'FLAGGED' ? 'rgba(16,185,129,0.28)' : 'rgba(255,255,255,0.07)'}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {p.status === 'FLAGGED' ? <AlertTriangle size={14} color="#10b981" /> : <CheckCircle size={14} color="#22c55e" />}
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#f8f8fa', margin: 0, flex: 1 }}>{p.memberName} - {p.zone}</p>
                    <span style={{ fontSize: 10, color: 'rgba(248,248,250,0.38)' }}>{p.patrolDate}</span>
                  </div>
                    {p.incidentType && <p style={{ fontSize: 11, color: '#f87171', margin: '5px 0 0 22px', fontWeight: 600 }}>Warning: {p.incidentType}</p>}
                </div>
              ))}
            </section>
          </div>
        )}

        {/* ── MEMBERS ── */}
        {tab === 'members' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <p className="label-caps">Forest Members ({d.members.length})</p>
              <span className="badge badge-live">Active</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {d.members.map((m, i) => {
                const rc = ROLE_COLOR[m.role] ?? '#3b82f6';
                return (
                  <div key={m.id} style={{ borderRadius: 16, padding: '14px 15px', background: `linear-gradient(90deg, ${rc}07 0%, rgba(10,10,12,0.88) 100%)`, border: `1px solid ${rc}1e`, display: 'flex', alignItems: 'center', gap: 13 }}>
                    {/* avatar */}
                    <div style={{ width: 42, height: 42, borderRadius: '50%', background: `linear-gradient(135deg, ${rc}28, ${rc}10)`, border: `1.5px solid ${rc}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16, fontWeight: 900, color: rc }}>
                      {m.name.charAt(0)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                        <p style={{ fontSize: 13, fontWeight: 800, color: '#f8f8fa', margin: 0 }}>{m.name}</p>
                        <span style={{ fontSize: 8, fontWeight: 800, padding: '2px 7px', borderRadius: 5, background: `${rc}18`, color: rc, border: `1px solid ${rc}30`, letterSpacing: 0.4, textTransform: 'uppercase' }}>{m.role}</span>
                      </div>
                      <p style={{ fontSize: 10, color: 'rgba(248,248,250,0.38)', margin: 0 }}>
                        {m.patrols} patrols · Joined {new Date(m.joinedAt).toLocaleDateString('en-KE', { year: 'numeric', month: 'short' })}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: 18, fontWeight: 900, color: rc, margin: '0 0 2px' }}>#{i + 1}</p>
                      {m.wallet ? (
                        <p style={{ fontSize: 9, color: 'rgba(248,248,250,0.32)', fontFamily: 'monospace', margin: 0 }}>{m.wallet.slice(0,10)}…</p>
                      ) : (
                        <p style={{ fontSize: 9, color: 'rgba(248,248,250,0.20)', margin: 0 }}>No wallet</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── PATROL LOGS ── */}
        {tab === 'patrol' && (
          <div>
            <p className="label-caps" style={{ marginBottom: 14 }}>Recent Patrol Logs</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {d.recentPatrols.map(p => (
                <div key={p.id} style={{
                  borderRadius: 18, padding: '15px 16px',
                  background: p.status === 'FLAGGED'
                    ? 'linear-gradient(135deg, rgba(16,185,129,0.10) 0%, rgba(10,10,12,0.90) 100%)'
                    : 'linear-gradient(135deg, rgba(34,197,94,0.07) 0%, rgba(10,10,12,0.90) 100%)',
                  border: `1px solid ${p.status === 'FLAGGED' ? 'rgba(16,185,129,0.28)' : 'rgba(34,197,94,0.18)'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 11, background: p.status === 'FLAGGED' ? 'rgba(16,185,129,0.15)' : 'rgba(34,197,94,0.12)', border: `1px solid ${p.status === 'FLAGGED' ? 'rgba(16,185,129,0.35)' : 'rgba(34,197,94,0.28)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {p.status === 'FLAGGED' ? <AlertTriangle size={17} color="#10b981" /> : <CheckCircle size={17} color="#22c55e" />}
                      </div>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 800, color: '#f8f8fa', margin: '0 0 2px' }}>{p.memberName}</p>
                        <p style={{ fontSize: 10, color: 'rgba(248,248,250,0.42)', margin: 0 }}>{p.zone} - {p.patrolDate}</p>
                      </div>
                    </div>
                    <span style={{
                      fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 6, letterSpacing: 0.4,
                      background: p.status === 'FLAGGED' ? 'rgba(16,185,129,0.14)' : 'rgba(34,197,94,0.12)',
                      color: p.status === 'FLAGGED' ? '#f87171' : '#4ade80',
                      border: `1px solid ${p.status === 'FLAGGED' ? 'rgba(16,185,129,0.30)' : 'rgba(34,197,94,0.28)'}`,
                    }}>{p.status}</span>
                  </div>

                  {p.incidentType && (
                    <div style={{ marginBottom: 10, padding: '8px 11px', borderRadius: 9, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.20)' }}>
                      <p style={{ fontSize: 11, color: '#f87171', fontWeight: 700, margin: 0 }}>Incident: {p.incidentType}</p>
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    {[
                      { label: 'Duration', value: `${p.durationMins} min`, color: '#3b82f6' },
                      { label: 'Trees Planted', value: p.treesPlanted.toString(), color: '#22c55e' },
                      { label: 'Status', value: p.status, color: p.status === 'FLAGGED' ? '#10b981' : '#22c55e' },
                    ].map(s => (
                      <div key={s.label} style={{ textAlign: 'center', padding: '8px 6px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <p style={{ fontSize: 13, fontWeight: 900, color: s.color, margin: '0 0 2px' }}>{s.value}</p>
                        <p style={{ fontSize: 8, color: 'rgba(248,248,250,0.35)', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', margin: 0 }}>{s.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── PRODUCTS ── */}
        {tab === 'products' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <p className="label-caps">Forest Products ({d.products.length})</p>
              <Link href="/securities" style={{ fontSize: 10, color: '#10b981', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>
                Manage <ExternalLink size={10} />
              </Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {d.products.map(p => {
                const pc = p.status === 'Active' ? '#22c55e' : '#f59e0b';
                return (
                  <div key={p.id} style={{ borderRadius: 18, padding: '15px 16px', background: 'linear-gradient(135deg, rgba(16,185,129,0.05) 0%, rgba(10,10,12,0.92) 100%)', border: '1px solid rgba(16,185,129,0.16)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 900, color: '#f8f8fa', margin: '0 0 4px' }}>{p.name}</p>
                        <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 5, background: 'rgba(255,255,255,0.06)', color: 'rgba(248,248,250,0.45)', fontWeight: 700, border: '1px solid rgba(255,255,255,0.09)' }}>{p.category}</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: 22, fontWeight: 900, color: '#4ade80', margin: '0 0 2px', letterSpacing: -0.8 }}>{p.apyPercent}%</p>
                        <p style={{ fontSize: 9, color: 'rgba(248,248,250,0.38)', margin: 0, fontWeight: 600 }}>APY</p>
                      </div>
                    </div>
                    {/* progress bar — tvl */}
                    <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, marginBottom: 10 }}>
                      <div style={{ height: '100%', width: `${Math.min(100, Math.round(p.tvlKes / 6000))}%`, borderRadius: 3, background: 'linear-gradient(90deg, #10b981, #f59e0b)' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', gap: 14 }}>
                        <div>
                          <p style={{ fontSize: 12, fontWeight: 800, color: '#f8f8fa', margin: '0 0 1px' }}>KES {(p.tvlKes / 1000).toFixed(0)}K</p>
                          <p style={{ fontSize: 8, color: 'rgba(248,248,250,0.35)', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', margin: 0 }}>TVL</p>
                        </div>
                        <div>
                          <p style={{ fontSize: 12, fontWeight: 800, color: '#f8f8fa', margin: '0 0 1px' }}>{p.memberCount}</p>
                          <p style={{ fontSize: 8, color: 'rgba(248,248,250,0.35)', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', margin: 0 }}>Members</p>
                        </div>
                        <div>
                          <p style={{ fontSize: 12, fontWeight: 800, color: '#f8f8fa', margin: '0 0 1px' }}>{p.token}</p>
                          <p style={{ fontSize: 8, color: 'rgba(248,248,250,0.35)', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', margin: 0 }}>Token</p>
                        </div>
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 9px', borderRadius: 6, background: `${pc}14`, color: pc, border: `1px solid ${pc}30` }}>{p.status}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── DAO GOVERNANCE ── */}
        {tab === 'gov' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <p className="label-caps">DAO Proposals</p>
              <Link href="/nuvari" style={{ fontSize: 10, color: '#10b981', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>
                Draft <FileText size={10} />
              </Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {d.proposals.map(p => {
                const total = totalVotes(p);
                const forPct = total > 0 ? Math.round((p.votesFor / total) * 100) : 0;
                const sc = p.status === 'ACTIVE' ? '#10b981' : p.status === 'PASSED' ? '#22c55e' : '#f59e0b';
                return (
                  <div key={p.id} style={{ borderRadius: 18, padding: '16px 16px', background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(10,10,12,0.92) 100%)', border: `1px solid ${sc}20` }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#10b981', fontFamily: 'monospace' }}>{p.proposalRef}</span>
                      <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 9px', borderRadius: 6, background: `${sc}14`, color: sc, border: `1px solid ${sc}30`, letterSpacing: 0.4 }}>{p.status}</span>
                    </div>
                    <p style={{ fontSize: 14, fontWeight: 800, color: '#f8f8fa', margin: '0 0 10px', lineHeight: 1.4 }}>{p.title}</p>
                    {/* vote bar */}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 10, color: '#4ade80', fontWeight: 700 }}>For: {p.votesFor} NVR ({forPct}%)</span>
                        <span style={{ fontSize: 10, color: '#f87171', fontWeight: 700 }}>Against: {p.votesAgainst} NVR</span>
                      </div>
                      <div style={{ height: 8, background: 'rgba(248,113,113,0.20)', borderRadius: 4 }}>
                        <div style={{ height: '100%', width: `${forPct}%`, borderRadius: 4, background: 'linear-gradient(90deg, #22c55e, #4ade80)', transition: 'width 0.6s ease' }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, color: 'rgba(248,248,250,0.38)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Vote size={11} /> {total} NVR total
                      </span>
                      <span style={{ fontSize: 10, color: 'rgba(248,248,250,0.38)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={10} /> {p.deadline}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quick links */}
            <div className="divider-green" style={{ margin: '20px 0' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'Securities',     href: '/securities', icon: ShieldCheck, color: '#a855f7' },
                { label: 'Pools',          href: '/pools',      icon: TrendingUp,  color: '#22c55e' },
                { label: 'AI Advisor',     href: '/ai',         icon: Globe,       color: '#10b981' },
                { label: 'Policy Builder', href: '/nuvari',     icon: FileText,    color: '#f59e0b' },
              ].map(l => (
                <Link key={l.label} href={l.href} style={{ textDecoration: 'none' }}>
                  <div className="glass" style={{ borderRadius: 14, padding: '14px 13px', display: 'flex', alignItems: 'center', gap: 10, borderColor: `${l.color}22`, background: `linear-gradient(90deg, ${l.color}07 0%, rgba(10,10,12,0.85) 100%)` }}>
                    <l.icon size={18} color={l.color} strokeWidth={1.8} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#f8f8fa' }}>{l.label}</span>
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
