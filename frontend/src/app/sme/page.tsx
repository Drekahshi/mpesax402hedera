'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Store, CircleDollarSign, BarChart3, TrendingUp,
  CreditCard, ShieldCheck, Package, ExternalLink, RefreshCw,
  ArrowUpRight, ArrowDownRight, Minus, AlertCircle, Zap,
  ChevronRight, FileText, Activity,
} from 'lucide-react';

interface SMEData {
  business: {
    businessName: string; ownerName: string; phoneNumber: string;
    category: string; location: string; cashFlowScore: number;
    creditLimit: number; walletAddress: string;
  };
  stats: {
    totalIncomeKes: number; totalExpenseKes: number; netProfitKes: number;
    creditGivenKes: number; debtOwedKes: number; cashFlowScore: number;
    activeLoans: number; activeCashFlowTokens: number;
  };
  ledger: { id: string; type: string; amountKes: number; counterparty: string; description: string; categoryTag: string; paymentMethod: string; timestamp: string }[];
  cashFlowTokens: { id: string; tokenRef: string; invoiceAmountKes: number; discountPriceKes: number; debtorName: string; maturityDate: string; status: string }[];
  monthlyFlow: { month: string; income: number; expense: number }[];
  products: { icon: string; name: string; rate: string; token: string; status: string; cap: string }[];
}

const ENTRY_CONFIG: Record<string, { color: string; bg: string; icon: React.ReactNode; sign: string }> = {
  INCOME:       { color: '#4ade80', bg: 'rgba(34,197,94,0.10)',   icon: <ArrowUpRight size={14} color="#4ade80" />,   sign: '+'  },
  EXPENSE:      { color: '#f87171', bg: 'rgba(248,113,113,0.10)', icon: <ArrowDownRight size={14} color="#f87171" />, sign: '-'  },
  CREDIT_GIVEN: { color: '#60a5fa', bg: 'rgba(96,165,250,0.10)',  icon: <ArrowUpRight size={14} color="#60a5fa" />,   sign: '→'  },
  DEBT_OWED:    { color: '#fbbf24', bg: 'rgba(251,191,36,0.10)',  icon: <AlertCircle size={14} color="#fbbf24" />,    sign: '!'  },
};

const TOKEN_STATUS_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  FUNDED:             { color: '#4ade80', bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.28)'  },
  LISTED_FOR_FUNDING: { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.28)' },
  DRAFT:              { color: '#fbbf24', bg: 'rgba(251,191,36,0.10)',  border: 'rgba(251,191,36,0.25)' },
  SETTLED_PAID:       { color: '#a78bfa', bg: 'rgba(167,139,250,0.10)', border: 'rgba(167,139,250,0.25)' },
  DEFAULTED:          { color: '#f87171', bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.25)' },
};

function ScoreRing({ score }: { score: number }) {
  const pct   = score / 100;
  const r     = 32;
  const circ  = 2 * Math.PI * r;
  const dash  = pct * circ;
  const color = score >= 70 ? '#22c55e' : score >= 45 ? '#f59e0b' : '#10b981';
  return (
    <div style={{ position: 'relative', width: 80, height: 80, flexShrink: 0 }}>
      <svg width="80" height="80" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
        <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.8s ease', filter: `drop-shadow(0 0 6px ${color}88)` }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 16, fontWeight: 900, color, lineHeight: 1 }}>{score.toFixed(0)}</span>
        <span style={{ fontSize: 8, color: 'rgba(248,248,250,0.38)', fontWeight: 700, letterSpacing: 0.5 }}>/ 100</span>
      </div>
    </div>
  );
}

function FlowBars({ data }: { data: { month: string; income: number; expense: number }[] }) {
  const max = Math.max(...data.map(d => d.income));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 72 }}>
      {data.map(d => (
        <div key={d.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <div style={{ width: '100%', display: 'flex', gap: 2, alignItems: 'flex-end', height: 60 }}>
            <div style={{ flex: 1, borderRadius: '3px 3px 1px 1px', background: 'linear-gradient(180deg,#22c55e,#22c55e88)', height: `${Math.round((d.income / max) * 58)}px`, minHeight: 3 }} />
            <div style={{ flex: 1, borderRadius: '3px 3px 1px 1px', background: 'linear-gradient(180deg,#10b981,#10b98188)', height: `${Math.round((d.expense / max) * 58)}px`, minHeight: 3 }} />
          </div>
          <p style={{ fontSize: 8, color: 'rgba(248,248,250,0.35)', margin: 0, fontWeight: 700 }}>{d.month}</p>
        </div>
      ))}
    </div>
  );
}

export default function SMEPage() {
  const [data, setData]     = useState<SMEData | null>(null);
  const [loading, setLoad]  = useState(true);
  const [tab, setTab]       = useState<'overview' | 'ledger' | 'rwa' | 'products'>('overview');

  const load = async () => {
    setLoad(true);
    try { const r = await fetch('/api/sme/stats'); setData(await r.json()); }
    catch { /* offline */ }
    finally { setLoad(false); }
  };
  useEffect(() => { load(); }, []);

  if (loading) return (
    <div style={{ minHeight: '100dvh', background: '#08080a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Store size={26} color="#fff" />
      </div>
      <p style={{ color: 'rgba(248,248,250,0.45)', fontSize: 13, fontWeight: 600 }}>Loading SME data...</p>
    </div>
  );

  const d = data!;

  return (
    <main style={{ minHeight: '100dvh', background: 'radial-gradient(ellipse 80% 50% at 90% -5%, rgba(59,130,246,0.10) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 10% 100%, rgba(232,65,66,0.06) 0%, transparent 55%), #08080a', color: '#f8f8fa', paddingBottom: 96, fontFamily: 'var(--font-sans)' }}>

      {/* ── HERO ── */}
      <div style={{ padding: '22px 18px 0', background: 'linear-gradient(180deg, rgba(59,130,246,0.08) 0%, transparent 100%)', borderBottom: '1px solid rgba(59,130,246,0.14)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <Link href="/" style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', flexShrink: 0 }}>
            <ArrowLeft size={17} color="#3b82f6" />
          </Link>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 17, fontWeight: 900, margin: '0 0 2px', letterSpacing: -0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.business.businessName}</h1>
            <p style={{ fontSize: 10, color: 'rgba(248,248,250,0.42)', margin: 0 }}>{d.business.ownerName} · {d.business.location}</p>
          </div>
          <button onClick={load} style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <RefreshCw size={13} color="rgba(255,255,255,0.40)" />
          </button>
        </div>

        {/* Cash flow score + key numbers */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
          <div style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(10,10,12,0.90))', border: '1px solid rgba(59,130,246,0.22)', borderRadius: 18, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, flex: 1 }}>
            <ScoreRing score={d.stats.cashFlowScore} />
            <div>
              <p style={{ fontSize: 12, fontWeight: 800, color: '#f8f8fa', margin: '0 0 3px' }}>Cash Flow Score</p>
              <p style={{ fontSize: 10, color: 'rgba(248,248,250,0.45)', margin: '0 0 6px' }}>AI-assessed creditworthiness</p>
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 5, background: 'rgba(34,197,94,0.12)', color: '#4ade80', fontWeight: 700, border: '1px solid rgba(34,197,94,0.28)' }}>
                  Credit: KES {(d.business.creditLimit / 1000).toFixed(0)}K
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 4 KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginBottom: 16 }}>
          {[
            { label: 'Total Income', value: `KES ${(d.stats.totalIncomeKes/1000).toFixed(0)}K`,  color: '#22c55e', icon: <ArrowUpRight size={16} color="#22c55e" /> },
            { label: 'Total Expense', value: `KES ${(d.stats.totalExpenseKes/1000).toFixed(0)}K`, color: '#f87171', icon: <ArrowDownRight size={16} color="#f87171" /> },
            { label: 'Net Profit',   value: `KES ${(d.stats.netProfitKes/1000).toFixed(0)}K`,    color: '#60a5fa', icon: <TrendingUp size={16} color="#60a5fa" /> },
            { label: 'Credit Given', value: `KES ${(d.stats.creditGivenKes/1000).toFixed(0)}K`,  color: '#fbbf24', icon: <Activity size={16} color="#fbbf24" /> },
          ].map(s => (
            <div key={s.label} style={{ borderRadius: 16, padding: '13px 13px', background: `linear-gradient(145deg, ${s.color}08 0%, rgba(10,10,12,0.88) 100%)`, border: `1px solid ${s.color}20`, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${s.color}45, transparent)` }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>{s.icon}<p style={{ fontSize: 9, color: 'rgba(248,248,250,0.38)', margin: 0, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase' }}>{s.label}</p></div>
              <p style={{ fontSize: 16, fontWeight: 900, color: s.color, margin: 0, letterSpacing: -0.5 }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 1 }}>
          {(['overview','ledger','rwa','products'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flexShrink: 0, padding: '7px 14px', borderRadius: '10px 10px 0 0', cursor: 'pointer', border: 'none',
              background: tab === t ? 'rgba(59,130,246,0.14)' : 'rgba(255,255,255,0.03)',
              borderTop: tab === t ? '1.5px solid rgba(59,130,246,0.50)' : '1.5px solid transparent',
              color: tab === t ? '#60a5fa' : 'rgba(248,248,250,0.38)',
              fontSize: 11, fontWeight: tab === t ? 800 : 600, textTransform: 'capitalize', transition: 'all 0.18s',
            }}>{t === 'rwa' ? 'RWA Tokens' : t.charAt(0).toUpperCase() + t.slice(1)}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: '18px 18px 0' }}>

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* flow chart */}
            <section>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <p className="label-caps">Monthly Cash Flow</p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <span style={{ fontSize: 9, color: '#22c55e', fontWeight: 700 }}>■ Income</span>
                  <span style={{ fontSize: 9, color: '#10b981', fontWeight: 700 }}>■ Expense</span>
                </div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '14px 12px 8px' }}>
                <FlowBars data={d.monthlyFlow} />
              </div>
            </section>

            {/* debt owed warning */}
            {d.stats.debtOwedKes > 0 && (
              <div style={{ padding: '13px 15px', borderRadius: 16, background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.22)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <AlertCircle size={20} color="#fbbf24" />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 800, color: '#fbbf24', margin: '0 0 2px' }}>Debt Owed</p>
                  <p style={{ fontSize: 11, color: 'rgba(248,248,250,0.55)', margin: 0 }}>KES {d.stats.debtOwedKes.toLocaleString()} payable to suppliers</p>
                </div>
              </div>
            )}

            {/* recent ledger preview */}
            <section>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <p className="label-caps">Recent Ledger</p>
                <button onClick={() => setTab('ledger')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
                  All entries <ChevronRight size={10} />
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {d.ledger.slice(0, 4).map(e => {
                  const ec = ENTRY_CONFIG[e.type] ?? ENTRY_CONFIG.INCOME;
                  return (
                    <div key={e.id} style={{ borderRadius: 14, padding: '11px 14px', background: ec.bg, border: `1px solid ${ec.color}20`, display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 9, background: `${ec.color}18`, border: `1px solid ${ec.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {ec.icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: '#f8f8fa', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.description}</p>
                        <p style={{ fontSize: 9, color: 'rgba(248,248,250,0.38)', margin: 0 }}>{e.categoryTag} · {e.paymentMethod}</p>
                      </div>
                      <p style={{ fontSize: 14, fontWeight: 900, color: ec.color, margin: 0, letterSpacing: -0.3, flexShrink: 0 }}>
                        {ec.sign}KES {(e.amountKes / 1000).toFixed(1)}K
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {/* ── FULL LEDGER ── */}
        {tab === 'ledger' && (
          <div>
            <p className="label-caps" style={{ marginBottom: 14 }}>Ledger Entries ({d.ledger.length})</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {d.ledger.map(e => {
                const ec = ENTRY_CONFIG[e.type] ?? ENTRY_CONFIG.INCOME;
                return (
                  <div key={e.id} style={{ borderRadius: 16, padding: '14px 15px', background: `linear-gradient(90deg, ${ec.color}06 0%, rgba(10,10,12,0.90) 100%)`, border: `1px solid ${ec.color}1e` }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 10, background: `${ec.color}14`, border: `1px solid ${ec.color}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{ec.icon}</div>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 800, color: '#f8f8fa', margin: '0 0 2px' }}>{e.description}</p>
                          <p style={{ fontSize: 10, color: 'rgba(248,248,250,0.38)', margin: 0 }}>{e.counterparty}</p>
                        </div>
                      </div>
                      <p style={{ fontSize: 15, fontWeight: 900, color: ec.color, margin: 0, letterSpacing: -0.3 }}>
                        {ec.sign}KES {e.amountKes.toLocaleString()}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 5, background: 'rgba(255,255,255,0.05)', color: 'rgba(248,248,250,0.45)', fontWeight: 700 }}>{e.categoryTag}</span>
                        <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 5, background: `${ec.color}12`, color: ec.color, fontWeight: 700 }}>{e.paymentMethod}</span>
                      </div>
                      <span style={{ fontSize: 9, color: 'rgba(248,248,250,0.32)' }}>{new Date(e.timestamp).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── RWA TOKENS ── */}
        {tab === 'rwa' && (
          <div>
            <p className="label-caps" style={{ marginBottom: 6 }}>Cash Flow Tokenisation (RWA)</p>
            <p style={{ fontSize: 11, color: 'rgba(248,248,250,0.45)', marginBottom: 14, lineHeight: 1.5 }}>
              Turn unpaid invoices into on-chain tokens. Investors fund KES upfront — you repay at maturity.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {d.cashFlowTokens.map(t => {
                const ts = TOKEN_STATUS_STYLE[t.status] ?? TOKEN_STATUS_STYLE.DRAFT;
                const yieldPct = (((t.invoiceAmountKes - t.discountPriceKes) / t.discountPriceKes) * 100).toFixed(1);
                return (
                  <div key={t.id} style={{ borderRadius: 18, padding: '16px 16px', background: 'linear-gradient(135deg, rgba(232,65,66,0.06) 0%, rgba(10,10,12,0.92) 100%)', border: `1px solid ${ts.color}28`, position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${ts.color}60, transparent)` }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <div>
                        <p style={{ fontSize: 10, fontWeight: 800, color: '#10b981', fontFamily: 'monospace', margin: '0 0 4px' }}>{t.tokenRef}</p>
                        <p style={{ fontSize: 14, fontWeight: 900, color: '#f8f8fa', margin: 0 }}>{t.debtorName}</p>
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 9px', borderRadius: 7, background: ts.bg, color: ts.color, border: `1px solid ${ts.border}`, letterSpacing: 0.3 }}>
                        {t.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                      {[
                        { label: 'Face Value',    value: `KES ${(t.invoiceAmountKes/1000).toFixed(0)}K`, color: '#f8f8fa'  },
                        { label: 'Funded At',     value: `KES ${(t.discountPriceKes/1000).toFixed(0)}K`,  color: '#60a5fa'  },
                        { label: 'Investor Yield', value: `${yieldPct}%`,                                  color: '#4ade80'  },
                      ].map(s => (
                        <div key={s.label} style={{ textAlign: 'center', padding: '9px 6px', borderRadius: 11, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                          <p style={{ fontSize: 13, fontWeight: 900, color: s.color, margin: '0 0 2px' }}>{s.value}</p>
                          <p style={{ fontSize: 8, color: 'rgba(248,248,250,0.35)', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', margin: 0 }}>{s.label}</p>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 10, padding: '7px 10px', borderRadius: 9, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 10, color: 'rgba(248,248,250,0.40)' }}>Maturity: <span style={{ color: '#f8f8fa', fontWeight: 700 }}>{t.maturityDate.slice(0,10)}</span></span>
                      <Link href="/connft" style={{ fontSize: 10, color: '#10b981', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>View NFT <ExternalLink size={9} /></Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── PRODUCTS ── */}
        {tab === 'products' && (
          <div>
            <p className="label-caps" style={{ marginBottom: 14 }}>Financial Products</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {d.products.map(p => {
                const sc = p.status === 'Active' ? { c: '#4ade80', b: 'rgba(34,197,94,0.12)', bd: 'rgba(34,197,94,0.28)' }
                         : p.status === 'Available' ? { c: '#60a5fa', b: 'rgba(96,165,250,0.12)', bd: 'rgba(96,165,250,0.28)' }
                         : { c: '#fbbf24', b: 'rgba(251,191,36,0.10)', bd: 'rgba(251,191,36,0.25)' };
                return (
                  <div key={p.name} className="glass" style={{ borderRadius: 16, padding: '13px 15px', display: 'flex', alignItems: 'center', gap: 13 }}>
                    <span style={{ fontSize: 24, flexShrink: 0, lineHeight: 1 }}>{p.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 800, color: '#f8f8fa', margin: '0 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p>
                      <p style={{ fontSize: 10, color: 'rgba(248,248,250,0.38)', margin: 0 }}>Cap: <span style={{ color: 'rgba(248,248,250,0.60)', fontWeight: 700 }}>{p.cap}</span> · {p.token}</p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 900, color: '#4ade80', margin: '0 0 4px', letterSpacing: -0.3 }}>{p.rate}</p>
                      <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 5, letterSpacing: 0.3, background: sc.b, color: sc.c, border: `1px solid ${sc.bd}` }}>{p.status}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="divider-green" style={{ margin: '20px 0' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'Scan & Pay', href: '/pay',    icon: CreditCard,  color: '#22c55e' },
                { label: 'Vaults',     href: '/vaults', icon: TrendingUp,  color: '#f59e0b' },
                { label: 'Policies',   href: '/nuvari', icon: ShieldCheck, color: '#a855f7' },
                { label: 'NFT Market', href: '/connft', icon: Package,     color: '#3b82f6' },
              ].map(l => (
                <Link key={l.label} href={l.href} style={{ textDecoration: 'none' }}>
                  <div className="glass" style={{ borderRadius: 14, padding: '14px 13px', display: 'flex', alignItems: 'center', gap: 10, borderColor: `${l.color}22`, background: `linear-gradient(90deg,${l.color}07 0%,rgba(10,10,12,0.85) 100%)` }}>
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
