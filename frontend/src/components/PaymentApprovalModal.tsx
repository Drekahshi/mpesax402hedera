'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import {
  X, CheckCircle, XCircle, Clock, RefreshCw,
  CreditCard, Zap, ShieldCheck, AlertTriangle, Bell,
} from 'lucide-react';

interface PendingPayment {
  id: string;
  route: string;
  payer: string;
  amount: number;
  symbol: string;
  service: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  nonce: string;
}

const ROUTE_ICONS: Record<string, React.ReactNode> = {
  '/agents/tx':          <Zap size={14} color="#10b981" />,
  '/agents/audit':       <ShieldCheck size={14} color="#22c55e" />,
  '/agents/codegen':     <CreditCard size={14} color="#3b82f6" />,
  '/agents/portfolio':   <CreditCard size={14} color="#f59e0b" />,
  '/agents/dao':         <CreditCard size={14} color="#a855f7" />,
};

function routeIcon(route: string) {
  const key = Object.keys(ROUTE_ICONS).find(k => route.startsWith(k));
  return key ? ROUTE_ICONS[key] : <CreditCard size={14} color="#10b981" />;
}

function elapsed(iso: string) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60)  return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs/60)}m ago`;
  return `${Math.floor(secs/3600)}h ago`;
}

interface Props { onClose: () => void; }

export default function PaymentApprovalModal({ onClose }: Props) {
  const { address } = useAccount();
  const [payments, setPayments] = useState<PendingPayment[]>([]);
  const [summary,  setSummary]  = useState({ pending: 0, approved: 0, rejected: 0, total: 0 });
  const [loading,  setLoading]  = useState(true);
  const [acting,   setActing]   = useState<string | null>(null);
  const [tab,      setTab]      = useState<'pending' | 'approved' | 'rejected'>('pending');

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/x402/approve?status=${tab}`, {
        headers: { 'x-wallet-address': address },
      });
      if (r.ok) {
        const d = await r.json();
        setPayments(d.payments ?? []);
        setSummary(d.summary ?? { pending: 0, approved: 0, rejected: 0, total: 0 });
      }
    } catch { /* offline */ }
    finally { setLoading(false); }
  }, [address, tab]);

  useEffect(() => { load(); }, [load]);

  const act = async (id: string, action: 'approve' | 'reject') => {
    if (!address) return;
    setActing(id);
    try {
      const r = await fetch('/api/x402/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-wallet-address': address },
        body: JSON.stringify({ id, action }),
      });
      if (r.ok) {
        setPayments(ps => ps.filter(p => p.id !== id));
        setSummary(s => ({
          ...s,
          pending:  s.pending  - 1,
          approved: action === 'approve' ? s.approved + 1 : s.approved,
          rejected: action === 'reject'  ? s.rejected + 1 : s.rejected,
        }));
      }
    } catch { /* noop */ }
    finally { setActing(null); }
  };

  const STATUS_COLOR = { pending: '#f59e0b', approved: '#22c55e', rejected: '#f87171' } as const;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: 'flex-end', background: 'rgba(0,0,0,0.70)', backdropFilter: 'blur(8px)' }}>
      <div style={{
        width: '100%', maxWidth: 520, margin: '0 auto',
        background: 'var(--surface-2, #17171c)',
        borderRadius: '24px 24px 0 0',
        border: '1px solid rgba(232,65,66,0.20)', borderBottom: 'none',
        maxHeight: '88dvh', display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 18px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: 13, background: 'rgba(232,65,66,0.14)', border: '1px solid rgba(232,65,66,0.32)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Bell size={19} color="#10b981" />
              </div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 900, color: '#f8f8fa', margin: 0 }}>x402 Payment Approvals</p>
                <p style={{ fontSize: 10, color: 'rgba(248,248,250,0.40)', margin: 0 }}>Review before agent executes</p>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(248,248,250,0.38)' }}>
              <X size={18} />
            </button>
          </div>

          {/* Summary strip */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
            {[
              { label: 'Pending',  val: summary.pending,  color: '#f59e0b' },
              { label: 'Approved', val: summary.approved, color: '#22c55e' },
              { label: 'Rejected', val: summary.rejected, color: '#f87171' },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center', padding: '10px 0', borderRadius: 12, background: `${s.color}08`, border: `1px solid ${s.color}20` }}>
                <p style={{ fontSize: 20, fontWeight: 900, color: s.color, margin: '0 0 2px', letterSpacing: -0.5 }}>{s.val}</p>
                <p style={{ fontSize: 8, color: 'rgba(248,248,250,0.38)', fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', margin: 0 }}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 0 }}>
            {(['pending', 'approved', 'rejected'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                flex: 1, padding: '8px 0', borderRadius: '10px 10px 0 0', border: 'none', cursor: 'pointer',
                background: tab === t ? `${STATUS_COLOR[t]}14` : 'rgba(255,255,255,0.03)',
                borderTop: tab === t ? `1.5px solid ${STATUS_COLOR[t]}50` : '1.5px solid transparent',
                color: tab === t ? STATUS_COLOR[t] : 'rgba(248,248,250,0.38)',
                fontSize: 11, fontWeight: tab === t ? 800 : 600, textTransform: 'capitalize', transition: 'all 0.18s',
              }}>{t}</button>
            ))}
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <RefreshCw size={22} color="rgba(232,65,66,0.50)" style={{ animation: 'spin 1s linear infinite', display: 'block', margin: '0 auto 10px' }} />
              <p style={{ fontSize: 12, color: 'rgba(248,248,250,0.35)' }}>Loading payments…</p>
            </div>
          ) : payments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <CheckCircle size={32} color="rgba(34,197,94,0.25)" style={{ display: 'block', margin: '0 auto 12px' }} />
              <p style={{ fontSize: 13, color: 'rgba(248,248,250,0.35)', margin: 0 }}>
                {tab === 'pending' ? 'No pending payments - all clear.' : `No ${tab} payments.`}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {payments.map(p => (
                <div key={p.id} style={{
                  borderRadius: 18, padding: '14px 15px',
                  background: p.status === 'pending' ? 'rgba(245,158,11,0.06)' : p.status === 'approved' ? 'rgba(34,197,94,0.05)' : 'rgba(248,113,113,0.05)',
                  border: `1px solid ${p.status === 'pending' ? 'rgba(245,158,11,0.22)' : p.status === 'approved' ? 'rgba(34,197,94,0.18)' : 'rgba(248,113,113,0.18)'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 11, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {routeIcon(p.route)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <p style={{ fontSize: 13, fontWeight: 800, color: '#f8f8fa', margin: 0 }}>{p.service}</p>
                        <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 5, background: `${STATUS_COLOR[p.status]}14`, color: STATUS_COLOR[p.status], border: `1px solid ${STATUS_COLOR[p.status]}30`, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                          {p.status}
                        </span>
                      </div>
                      <p style={{ fontSize: 10, color: 'rgba(248,248,250,0.38)', margin: '2px 0 0', fontFamily: 'monospace' }}>{p.route}</p>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: p.status === 'pending' ? 12 : 0 }}>
                    {[
                      { label: 'Payer',    value: `${p.payer.slice(0,10)}…` },
                      { label: 'Amount',   value: `${p.amount} ${p.symbol}` },
                      { label: 'When',     value: elapsed(p.requestedAt)    },
                    ].map(s => (
                      <div key={s.label} style={{ textAlign: 'center', padding: '8px 5px', borderRadius: 9, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <p style={{ fontSize: 11, fontWeight: 800, color: '#f8f8fa', margin: '0 0 2px', fontFamily: s.label === 'Payer' ? 'monospace' : 'inherit' }}>{s.value}</p>
                        <p style={{ fontSize: 8, color: 'rgba(248,248,250,0.35)', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', margin: 0 }}>{s.label}</p>
                      </div>
                    ))}
                  </div>

                  {p.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => act(p.id, 'approve')} disabled={acting === p.id} style={{
                        flex: 1, padding: '10px 0', borderRadius: 12, border: 'none', cursor: acting === p.id ? 'not-allowed' : 'pointer',
                        background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff',
                        fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        opacity: acting === p.id ? 0.6 : 1, transition: 'opacity 0.2s',
                      }}>
                        <CheckCircle size={14} /> Approve
                      </button>
                      <button onClick={() => act(p.id, 'reject')} disabled={acting === p.id} style={{
                        flex: 1, padding: '10px 0', borderRadius: 12, border: 'none', cursor: acting === p.id ? 'not-allowed' : 'pointer',
                        background: 'rgba(248,113,113,0.14)', color: '#f87171',
                        outline: '1px solid rgba(248,113,113,0.28)', fontSize: 12, fontWeight: 800,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        opacity: acting === p.id ? 0.6 : 1, transition: 'opacity 0.2s',
                      }}>
                        <XCircle size={14} /> Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 18px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 10, flexShrink: 0 }}>
          <button onClick={load} style={{ flex: 1, padding: '11px 0', borderRadius: 13, border: '1px solid rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.04)', color: 'rgba(248,248,250,0.55)', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <RefreshCw size={13} /> Refresh
          </button>
          <button onClick={onClose} style={{ flex: 1, padding: '11px 0', borderRadius: 13, border: 'none', background: 'linear-gradient(135deg,#10b981,#047857)', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
            Close
          </button>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
