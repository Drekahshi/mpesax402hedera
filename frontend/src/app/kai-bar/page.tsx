'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Flame, Users, CheckCircle2, Gift, Copy, ChevronRight,
  Lock, Trophy, Bird, ArrowLeft, Share2, Loader2,
} from 'lucide-react';
import { usePrivyAuth } from '@/lib/privy-auth';
import { useKaiBar } from '@/hooks/useKaiBar';
import { AirdropClaimCard } from '@/components/AirdropClaimCard';

const Rs: React.CSSProperties = { textShadow: '0 1px 4px rgba(0,0,0,0.88)' };
const W: React.CSSProperties = { width: '100%', maxWidth: 1080, margin: '0 auto', padding: '0 40px' };

const TASK_ICON: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  SIGNUP: Gift,
  EMAIL_VERIFY: CheckCircle2,
  COMPLETE_PROFILE: Users,
  INVITE_FRIEND: Share2,
  FIRST_TRANSACTION: Flame,
  DAILY_CHECKIN: Trophy,
  CAMPAIGN: Bird,
};

const NEXT_MILESTONE = 15000;

export default function KaiBarDashboard() {
  const { authenticated, ready, address, signInWithGoogle } = usePrivyAuth();
  const { privyUserId, kaiBar, tasks, referralCode, referralStats, airdrop, entries, loading, reload } = useKaiBar();

  const [copied, setCopied] = useState(false);
  const [completing, setCompleting] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const progress = Math.min((kaiBar / NEXT_MILESTONE) * 100, 100);
  const remaining = Math.max(NEXT_MILESTONE - kaiBar, 0);
  const rank = kaiBar > 15000 ? 42 : kaiBar > 10000 ? 127 : kaiBar > 5000 ? 318 : kaiBar > 1000 ? 712 : 1500;
  const todayEarned = entries.filter(e => {
    const d = new Date(e.createdAt);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).reduce((s, e) => s + e.amount, 0);

  const copyCode = () => {
    if (!referralCode) return;
    navigator.clipboard.writeText(referralCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 1800);
    return () => clearTimeout(t);
  }, []);

  if (!ready && !timedOut) {
    return <main style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Loader2 className="animate-spin" size={26} color="#10b981" /></main>;
  }

  if (!authenticated || !address) {
    return (
      <main style={{ minHeight: '100dvh', color: '#fff', fontFamily: 'var(--font-sans)', position: 'relative', paddingBottom: 80 }}>
        <div style={{ ...W, paddingTop: 72, textAlign: 'center', position: 'relative', zIndex: 5 }}>
          <div className="float" style={{
            width: 72, height: 72, borderRadius: '50%', margin: '0 auto 16px',
            background: 'linear-gradient(135deg,rgba(245,158,11,0.4),rgba(4,78,59,0.85))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 32px rgba(245,158,11,0.35)',
          }}>
            <Flame size={30} color="#fbbf24" />
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 900, margin: 0, letterSpacing: -0.5, ...Rs }}>
            <span style={{ color: '#fbbf24' }}>Kai</span> Bar
          </h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: '8px 0 24px', ...Rs }}>
            Sign in with Google to start earning points toward future rewards.
          </p>
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={signInWithGoogle} style={{
            padding: '13px 26px', borderRadius: 14, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg,#f59e0b,#b45309)', color: '#fff',
            boxShadow: '0 6px 26px rgba(245,158,11,0.4)', fontSize: 14, fontWeight: 800,
          }}>
            Continue with Google
          </motion.button>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: '100dvh', color: '#fff', fontFamily: 'var(--font-sans)', position: 'relative', paddingBottom: 80 }}>
      <div style={{ ...W, paddingTop: 28, position: 'relative', zIndex: 5 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase', color: 'rgba(255,255,255,0.48)', margin: 0 }}>Kainovari Rewards</p>
            <h1 style={{ fontSize: 26, fontWeight: 900, margin: '4px 0 0', letterSpacing: -0.5, ...Rs }}>
              <span style={{ color: '#fbbf24' }}>Kai</span> Bar
            </h1>
          </div>
          <button onClick={reload} style={{
            padding: '9px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)',
            fontSize: 12, fontWeight: 700,
          }}>{loading ? 'Refreshing…' : 'Refresh'}</button>
        </div>

        {/* Balance hero */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="glass-elevated" style={{
            borderRadius: 20, padding: '24px 26px', marginBottom: 14, overflow: 'hidden', position: 'relative',
            background: 'linear-gradient(145deg,rgba(24,18,8,0.85),rgba(6,6,14,0.78))',
            boxShadow: '0 1px 0 rgba(255,255,255,0.09) inset, 0 0 0 0.5px rgba(245,158,11,0.22) inset, 0 16px 50px rgba(0,0,0,0.5)',
          }}>
          <div style={{ position: 'absolute', top: -60, right: -40, width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle,rgba(245,158,11,0.16) 0%,transparent 70%)', pointerEvents: 'none' }} />
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>🔥 KAI BAR</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 44, fontWeight: 900, letterSpacing: -2, lineHeight: 1, color: '#fbbf24', textShadow: '0 0 24px rgba(245,158,11,0.5)', ...Rs }}>{kaiBar.toLocaleString()}</span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>points</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
            {[
              { label: 'Your Rank', value: `#${rank.toLocaleString()}` },
              { label: 'Today', value: `+${todayEarned.toLocaleString()}` },
              { label: 'Network', value: `${referralStats.networkSize}` },
              { label: 'Airdrop', value: airdrop?.eligible ? 'Eligible' : 'In Progress', hl: airdrop?.eligible },
            ].map(s => (
              <div key={s.label} style={{
                padding: '10px 12px', borderRadius: 12, textAlign: 'center',
                background: 'rgba(255,255,255,0.04)', boxShadow: '0 0 0 0.5px rgba(255,255,255,0.07) inset',
              }}>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', margin: '0 0 3px' }}>{s.label}</p>
                <p style={{ fontSize: 15, fontWeight: 800, margin: 0, color: s.hl ? '#fbbf24' : 'rgba(255,255,255,0.9)', ...Rs }}>{s.value}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Milestone progress */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="glass" style={{
            borderRadius: 16, padding: '16px 20px', marginBottom: 14,
            background: 'rgba(8,8,16,0.6)', backdropFilter: 'blur(16px)',
            boxShadow: '0 0 0 0.5px rgba(245,158,11,0.18) inset',
          }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.7)', margin: 0 }}>
              Next milestone: <span style={{ color: '#fbbf24', fontWeight: 900 }}>{NEXT_MILESTONE.toLocaleString()}</span> Kai Bar
            </p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', margin: 0 }}>{remaining.toLocaleString()} remaining</p>
          </div>
          <div style={{ height: 10, borderRadius: 6, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
            <motion.div initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.9, ease: 'easeOut' }}
              style={{ height: '100%', borderRadius: 6, background: 'linear-gradient(90deg,#f59e0b,#10b981)', boxShadow: '0 0 12px rgba(245,158,11,0.6)' }} />
          </div>
        </motion.div>

        {/* Referral card */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="glass-elevated" style={{
            borderRadius: 18, padding: '18px 20px', marginBottom: 14, overflow: 'hidden', position: 'relative',
            background: 'linear-gradient(145deg,rgba(10,20,16,0.8),rgba(6,6,14,0.72))',
            boxShadow: '0 0 0 0.5px rgba(16,185,129,0.2) inset, 0 10px 36px rgba(0,0,0,0.42)',
          }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(16,185,129,0.13)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={20} color="#34d399" />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 14, fontWeight: 800, margin: 0, ...Rs }}>Invite friends</p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', margin: 0 }}>+500 Kai Bar per direct referral · +50 for second-level</p>
            </div>
          </div>
          {referralCode ? (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <code style={{
                  flex: 1, fontSize: 17, fontWeight: 800, letterSpacing: 1, fontFamily: 'monospace',
                  background: 'rgba(16,185,129,0.08)', borderRadius: 10, padding: '11px 14px',
                  color: '#34d399', boxShadow: '0 0 0 1px rgba(52,211,153,0.25) inset',
                }}>{referralCode}</code>
                <motion.button whileTap={{ scale: 0.93 }} onClick={copyCode} style={{
                  padding: '0 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: 'rgba(16,185,129,0.14)', color: '#34d399', fontSize: 13, fontWeight: 800,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  {copied ? <CheckCircle2 size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy'}
                </motion.button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                {[
                  { label: 'Direct', v: referralStats.direct },
                  { label: 'Active', v: referralStats.active },
                  { label: 'Network', v: referralStats.networkSize },
                ].map(s => (
                  <div key={s.label} style={{ textAlign: 'center', background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '9px 6px' }}>
                    <p style={{ fontSize: 16, fontWeight: 900, color: '#34d399', margin: 0 }}>{s.v}</p>
                    <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', margin: '2px 0 0' }}>{s.label}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', margin: 0 }}>Complete signing up to get your referral code.</p>
          )}
        </motion.div>

        {/* Tasks */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="glass-elevated" style={{
            borderRadius: 18, padding: '18px 20px', marginBottom: 14,
            background: 'rgba(6,6,14,0.72)', backdropFilter: 'blur(22px)',
            boxShadow: '0 0 0 0.5px rgba(16,185,129,0.2) inset, 0 12px 40px rgba(0,0,0,0.48)',
          }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', margin: '0 0 12px' }}>
            Earn Kai Bar
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tasks.map(t => {
              const Icon = TASK_ICON[t.taskType] ?? Gift;
              return (
                <div key={t.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '11px 13px', borderRadius: 12,
                  background: t.completed ? 'rgba(52,211,153,0.08)' : 'rgba(255,255,255,0.03)',
                  boxShadow: `0 0 0 1px ${t.completed ? 'rgba(52,211,153,0.2)' : 'rgba(255,255,255,0.06)'} inset`,
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    background: t.completed ? 'rgba(52,211,153,0.14)' : 'rgba(255,255,255,0.05)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon size={17} color={t.completed ? '#6ee7b7' : 'rgba(255,255,255,0.5)'} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 800, margin: 0, color: t.completed ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.92)', ...Rs }}>{t.name}</p>
                    {t.description && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: '2px 0 0' }}>{t.description}</p>}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 900, color: '#fbbf24', ...Rs }}>+{t.rewardAmount.toLocaleString()}</span>
                  {t.completed ? (
                    <CheckCircle2 size={19} color="#34d399" />
                  ) : (
                    <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} disabled={completing === t.id}
                      onClick={async () => {
                        setCompleting(t.id);
                        try {
                          const res = await fetch('/api/kai-bar/tasks/complete', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ privyUserId, taskId: t.id }),
                          });
                          const d = await res.json();
                          if (d.error) { setToast(d.error); return; }
                          await reload();
                          setToast(`+${d.earned} Kai Bar earned!`);
                        } catch {
                          setToast('Something went wrong.');
                        } finally {
                          setCompleting(null);
                          setTimeout(() => setToast(null), 3000);
                        }
                      }}
                      style={{
                        padding: '7px 13px', borderRadius: 9, border: 'none', cursor: 'pointer',
                        background: 'rgba(16,185,129,0.15)', color: '#34d399', fontSize: 11, fontWeight: 800,
                      }}>
                      {completing === t.id ? '…' : 'Do it'}
                    </motion.button>
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Airdrop eligibility */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="glass-elevated" style={{
            borderRadius: 18, padding: '18px 20px',
            background: 'rgba(6,6,14,0.72)', backdropFilter: 'blur(22px)',
            boxShadow: '0 0 0 0.5px rgba(245,158,11,0.18) inset, 0 12px 40px rgba(0,0,0,0.48)',
          }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Lock size={19} color="#fbbf24" />
            </div>
            <p style={{ fontSize: 14, fontWeight: 800, margin: 0, ...Rs }}>Airdrop Status</p>
            <span style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800,
              background: airdrop?.eligible ? 'rgba(52,211,153,0.13)' : 'rgba(255,255,255,0.05)',
              color: airdrop?.eligible ? '#6ee7b7' : 'rgba(255,255,255,0.5)',
              boxShadow: `0 0 0 1px ${airdrop?.eligible ? 'rgba(52,211,153,0.35)' : 'rgba(255,255,255,0.1)'} inset`,
            }}>
              {airdrop?.eligible ? '✓ Eligible' : 'In progress'}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
            {[
              { label: 'Contribution', v: airdrop?.contributionScore ?? 0 },
              { label: 'Referral', v: airdrop?.referralScore ?? 0 },
              { label: 'Activity', v: airdrop?.activityScore ?? 0 },
            ].map(s => (
              <div key={s.label} style={{ padding: '10px 12px', borderRadius: 12, textAlign: 'center', background: 'rgba(255,255,255,0.04)' }}>
                <p style={{ fontSize: 16, fontWeight: 900, color: '#fbbf24', margin: 0 }}>{s.v.toLocaleString()}</p>
                <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', margin: '3px 0 0' }}>{s.label} score</p>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', margin: '12px 0 0' }}>
            Eligibility is tracked now; the Kai Bar → KAI conversion formula is not set in stone yet.
          </p>
          <AirdropClaimCard eligible={airdrop?.eligible ?? false} amount={airdrop?.contributionScore ?? 0} />
        </motion.div>

        {/* Recent ledger */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="glass" style={{
            borderRadius: 16, padding: '16px 20px', marginTop: 14,
            background: 'rgba(8,8,16,0.6)', backdropFilter: 'blur(16px)',
            boxShadow: '0 0 0 0.5px rgba(255,255,255,0.08) inset',
          }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', margin: '0 0 10px' }}>
            Activity ledger
          </p>
          {entries.length === 0 ? (
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: 0 }}>No activity yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {entries.slice(0, 6).map(e => (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.03)' }}>
                  <span style={{ fontSize: 15, fontWeight: 900, color: e.amount > 0 ? '#34d399' : '#f87171', minWidth: 52 }}>
                    {e.amount > 0 ? '+' : ''}{e.amount}
                  </span>
                  <span style={{ flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>{e.description}</span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>
                    {new Date(e.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {toast && <div style={{
          position: 'fixed', bottom: 96, left: '50%', transform: 'translateX(-50%)', zIndex: 50,
          padding: '11px 20px', borderRadius: 12, fontSize: 13, fontWeight: 800,
          background: 'rgba(6,6,14,0.92)', color: '#34d399',
          boxShadow: '0 0 0 1px rgba(52,211,153,0.3), 0 10px 30px rgba(0,0,0,0.5)',
        }}>{toast}</div>}

        <Link href="/wallet" style={{ textDecoration: 'none' }}>
          <div className="hover-shine" style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', marginTop: 14,
            borderRadius: 16, background: 'rgba(255,255,255,0.03)',
            boxShadow: '0 0 0 0.5px rgba(255,255,255,0.08) inset',
          }}>
            <ArrowLeft size={18} color="rgba(255,255,255,0.4)" />
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 800, margin: 0, color: 'rgba(255,255,255,0.85)' }}>Back to Wallet</p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: 0 }}>Manage your assets</p>
            </div>
            <ChevronRight size={16} color="rgba(255,255,255,0.3)" />
          </div>
        </Link>
      </div>
    </main>
  );
}