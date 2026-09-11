"use client";

import React, { useState, useEffect } from "react";
import { X, ArrowRight, Zap, Lock, Unlock, RefreshCw, TrendingUp, Clock } from "lucide-react";
import type { PoolToken } from "./CryptoBubblesCanvas";

interface PoolDrawerProps {
  token: PoolToken | null;
  onClose: () => void;
  stakedPositions: Record<string, StakePosition>;
  onStakeUpdate: (tokenId: string, pos: StakePosition | null) => void;
}

export interface StakePosition {
  stakedAmount: number;
  earnedRewards: number;
  stakedAt: number; // timestamp ms
  lockDays: number;
  autoRestake: boolean;
}

type Tab = "deposit" | "stake" | "withdraw";

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`w-10 h-5 rounded-full relative transition-colors flex-shrink-0 ${enabled ? "bg-[#34d399]" : "bg-white/20"}`}
    >
      <div
        className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-200"
        style={{ transform: enabled ? "translateX(20px)" : "translateX(0)" }}
      />
    </button>
  );
}

export default function PoolDrawer({ token, onClose, stakedPositions, onStakeUpdate }: PoolDrawerProps) {
  const [tab, setTab] = useState<Tab>("deposit");
  const [amount, setAmount] = useState("");
  const [isX402Enabled, setIsX402Enabled] = useState(false);
  const [autoRestake, setAutoRestake] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [liveRewards, setLiveRewards] = useState(0);

  const position = token ? stakedPositions[token.id] ?? null : null;

  // Simulate live reward accrual from stake position
  useEffect(() => {
    if (!position) { setLiveRewards(0); return; }
    const tick = () => {
      const elapsed = (Date.now() - position.stakedAt) / 1000; // seconds
      const perSecond = (position.stakedAmount * (token!.apy / 100)) / (365 * 24 * 3600);
      setLiveRewards(position.earnedRewards + perSecond * elapsed);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [position, token]);

  if (!token) return null;

  const lockDays = token.poolType === "Monthly Lock" ? 30 : token.poolType === "RWA Lock" ? 90 : 0;
  const isLocked = position ? (Date.now() - position.stakedAt) < lockDays * 86400_000 : false;
  const lockEnds = position ? new Date(position.stakedAt + lockDays * 86400_000) : null;

  const callApi = async (action: string, extra: object = {}) => {
    setIsLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/pools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, tokenId: token.id, amount: parseFloat(amount) || 0, ...extra }),
      });
      const data = await res.json();
      setMessage({ text: data.message ?? data.error, ok: res.ok });
      return { ok: res.ok, data };
    } catch {
      setMessage({ text: "Network error. Please try again.", ok: false });
      return { ok: false, data: null };
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeposit = async () => {
    if (!amount || parseFloat(amount) <= 0) return;
    const { ok } = await callApi("deposit", { x402Sweep: isX402Enabled });
    if (ok) setAmount("");
  };

  const handleStake = async () => {
    if (!amount || parseFloat(amount) <= 0) return;
    const { ok } = await callApi("stake", { autoRestake, lockDays });
    if (ok) {
      onStakeUpdate(token.id, {
        stakedAmount: parseFloat(amount),
        earnedRewards: 0,
        stakedAt: Date.now(),
        lockDays,
        autoRestake,
      });
      setAmount("");
    }
  };

  const handleUnstake = async () => {
    if (!position || isLocked) return;
    const { ok } = await callApi("unstake");
    if (ok) onStakeUpdate(token.id, null);
  };

  const handleRestake = async () => {
    if (!position || liveRewards <= 0) return;
    const { ok } = await callApi("restake", { rewards: liveRewards });
    if (ok) {
      onStakeUpdate(token.id, {
        ...position,
        stakedAmount: position.stakedAmount + liveRewards,
        earnedRewards: 0,
        stakedAt: Date.now(),
      });
    }
  };

  const TABS: { id: Tab; label: string }[] = [
    { id: "deposit", label: "Deposit" },
    { id: "stake", label: "Stake" },
    { id: "withdraw", label: "Withdraw" },
  ];

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" onClick={onClose} />

      <div
        className="fixed top-0 right-0 h-full w-full max-w-md z-50 flex flex-col"
        style={{
          background: "linear-gradient(180deg, #111827 0%, #030712 100%)",
          borderLeft: `1px solid ${token.colorStart}`,
          boxShadow: "-10px 0 40px rgba(0,0,0,0.8)",
        }}
      >
        {/* ── Header ── */}
        <div
          className="p-6 relative overflow-hidden flex-shrink-0"
          style={{ background: `linear-gradient(135deg, ${token.colorStart}22, ${token.colorEnd}11)` }}
        >
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full filter blur-[80px] opacity-20 pointer-events-none" style={{ background: token.colorStart }} />

          <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors">
            <X size={20} />
          </button>

          <div className="flex items-center gap-4 relative z-10">
            <div className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg border border-white/10 relative"
              style={{ background: `linear-gradient(135deg, ${token.colorStart}, ${token.colorEnd})` }}
            >
              <span className="text-xl font-bold text-white">{token.symbol[0]}</span>
              {position && (
                <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#34d399] border-2 border-[#111827] flex items-center justify-center">
                  <Lock size={9} className="text-black" />
                </div>
              )}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white mb-0.5">{token.symbol}</h2>
              <p className="text-sm text-white/60">{token.name}</p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3 relative z-10">
            <div className="bg-black/30 border border-white/5 rounded-xl p-3">
              <p className="text-xs text-white/50 mb-1">Base APY</p>
              <p className="text-base font-bold" style={{ color: token.colorStart }}>+{token.apy.toFixed(1)}%</p>
            </div>
            <div className="bg-black/30 border border-white/5 rounded-xl p-3">
              <p className="text-xs text-white/50 mb-1">Staked APY</p>
              <p className="text-base font-bold text-[#34d399]">+{(token.apy * 1.35).toFixed(1)}%</p>
            </div>
            <div className="bg-black/30 border border-white/5 rounded-xl p-3">
              <p className="text-xs text-white/50 mb-1">Lock Period</p>
              <p className="text-base font-bold text-white/90">{lockDays > 0 ? `${lockDays}d` : "None"}</p>
            </div>
          </div>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">

          {/* Tabs */}
          <div className="bg-white/5 p-1 rounded-xl flex text-sm font-semibold">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => { setTab(t.id); setMessage(null); setAmount(""); }}
                className={`flex-1 py-2 rounded-lg transition-all ${tab === t.id ? "bg-white/15 text-white shadow-sm" : "text-white/40 hover:text-white/70"}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ── DEPOSIT TAB ── */}
          {tab === "deposit" && (
            <>
              <div>
                <label className="block text-xs font-bold text-white/50 mb-2 uppercase tracking-wider">Amount to Deposit</label>
                <div className="relative">
                  <input
                    type="number" value={amount} onChange={e => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-4 text-2xl text-white outline-none focus:border-white/30 transition-colors"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-white/40">{token.symbol}</span>
                </div>
              </div>

              <div className="bg-[#111827] border border-white/5 rounded-xl p-4 flex items-start gap-4">
                <Zap size={18} className="text-[#34d399] mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-1">
                    <h3 className="text-sm font-bold text-white">x402 Auto-Sweep</h3>
                    <Toggle enabled={isX402Enabled} onToggle={() => setIsX402Enabled(!isX402Enabled)} />
                  </div>
                  <p className="text-xs text-white/50">Route earned yields via x402 to your Insurance or Pension Vault automatically.</p>
                </div>
              </div>

              <div className="mt-auto">
                {message && <div className={`mb-3 p-3 rounded-xl text-sm text-center border ${message.ok ? "bg-[#34d399]/10 border-[#34d399]/30 text-[#34d399]" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>{message.text}</div>}
                <button onClick={handleDeposit} disabled={isLoading || !amount || parseFloat(amount) <= 0}
                  className="w-full py-4 rounded-xl font-bold text-white flex justify-center items-center gap-2 disabled:opacity-40 disabled:pointer-events-none transition-transform hover:scale-[1.02] active:scale-[0.98]"
                  style={{ background: `linear-gradient(135deg, ${token.colorStart}, ${token.colorEnd})` }}>
                  {isLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>Confirm Deposit <ArrowRight size={18} /></>}
                </button>
              </div>
            </>
          )}

          {/* ── STAKE TAB ── */}
          {tab === "stake" && (
            <>
              {/* Live staking position */}
              {position && (
                <div className="rounded-2xl p-4 border" style={{ background: `${token.colorStart}10`, borderColor: `${token.colorStart}40` }}>
                  <p className="text-xs font-bold text-white/50 uppercase tracking-wider mb-3">Current Stake Position</p>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                      <p className="text-xs text-white/40 mb-0.5">Staked</p>
                      <p className="text-lg font-bold text-white">{position.stakedAmount.toFixed(4)} <span className="text-xs text-white/40">{token.symbol}</span></p>
                    </div>
                    <div>
                      <p className="text-xs text-white/40 mb-0.5">Earned Rewards</p>
                      <p className="text-lg font-bold text-[#34d399]">{liveRewards.toFixed(6)} <span className="text-xs text-[#34d399]/60">{token.symbol}</span></p>
                    </div>
                  </div>

                  {lockDays > 0 && (
                    <div className="flex items-center gap-2 text-xs mb-3">
                      <Clock size={12} className="text-white/40" />
                      <span className="text-white/50">
                        {isLocked
                          ? `Locked until ${lockEnds?.toLocaleDateString()}`
                          : "Lock period expired - can unstake"}
                      </span>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button onClick={handleRestake} disabled={isLoading || liveRewards <= 0}
                      className="flex-1 py-2.5 rounded-xl font-bold text-sm bg-[#34d399]/15 border border-[#34d399]/30 text-[#34d399] flex items-center justify-center gap-1.5 hover:bg-[#34d399]/25 transition-colors disabled:opacity-40 disabled:pointer-events-none">
                      {isLoading ? <div className="w-4 h-4 border-2 border-[#34d399]/30 border-t-[#34d399] rounded-full animate-spin" /> : <><RefreshCw size={14} /> Restake Rewards</>}
                    </button>
                    <button onClick={handleUnstake} disabled={isLoading || isLocked}
                      className="flex-1 py-2.5 rounded-xl font-bold text-sm bg-white/5 border border-white/10 text-white/70 flex items-center justify-center gap-1.5 hover:bg-white/10 transition-colors disabled:opacity-40 disabled:pointer-events-none">
                      <Unlock size={14} /> Unstake
                    </button>
                  </div>
                </div>
              )}

              {/* New stake */}
              <div>
                <label className="block text-xs font-bold text-white/50 mb-2 uppercase tracking-wider">
                  {position ? "Add to Stake" : "Amount to Stake"}
                </label>
                <div className="relative">
                  <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-4 text-2xl text-white outline-none focus:border-white/30 transition-colors" />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-white/40">{token.symbol}</span>
                </div>
                <p className="text-xs text-white/40 mt-1.5">
                  Staking APY: <span className="text-[#34d399] font-semibold">+{(token.apy * 1.35).toFixed(1)}%</span>
                  {lockDays > 0 && <span className="ml-2 text-amber-400/70">· {lockDays}-day lock applies</span>}
                </p>
              </div>

              {/* Auto-Restake */}
              <div className="bg-[#111827] border border-white/5 rounded-xl p-4 flex items-start gap-4">
                <TrendingUp size={18} className="text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-1">
                    <h3 className="text-sm font-bold text-white">Auto-Restake</h3>
                    <Toggle enabled={autoRestake} onToggle={() => setAutoRestake(!autoRestake)} />
                  </div>
                  <p className="text-xs text-white/50">Automatically compound earned rewards back into your stake - maximizing APY through continuous reinvestment.</p>
                </div>
              </div>

              {lockDays > 0 && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-400/5 border border-amber-400/20">
                  <Lock size={16} className="text-amber-400 flex-shrink-0" />
                  <p className="text-xs text-amber-300/80 leading-relaxed">
                    This pool has a <strong>{lockDays}-day lock period</strong>. Staked tokens cannot be withdrawn before the lock expires.
                  </p>
                </div>
              )}

              <div className="mt-auto">
                {message && <div className={`mb-3 p-3 rounded-xl text-sm text-center border ${message.ok ? "bg-[#34d399]/10 border-[#34d399]/30 text-[#34d399]" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>{message.text}</div>}
                <button onClick={handleStake} disabled={isLoading || !amount || parseFloat(amount) <= 0}
                  className="w-full py-4 rounded-xl font-bold text-white flex justify-center items-center gap-2 disabled:opacity-40 disabled:pointer-events-none transition-transform hover:scale-[1.02] active:scale-[0.98]"
                  style={{ background: `linear-gradient(135deg, ${token.colorStart}, ${token.colorEnd})` }}>
                  {isLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Lock size={16} /> Confirm Stake</>}
                </button>
              </div>
            </>
          )}

          {/* ── WITHDRAW TAB ── */}
          {tab === "withdraw" && (
            <>
              <div>
                <label className="block text-xs font-bold text-white/50 mb-2 uppercase tracking-wider">Amount to Withdraw</label>
                <div className="relative">
                  <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-4 text-2xl text-white outline-none focus:border-white/30 transition-colors" />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-white/40">{token.symbol}</span>
                </div>
              </div>

              {isLocked && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-red-500/5 border border-red-500/20">
                  <Lock size={16} className="text-red-400 flex-shrink-0" />
                  <p className="text-xs text-red-300/80">Staked tokens are locked until <strong>{lockEnds?.toLocaleDateString()}</strong>. You can still withdraw deposited (non-staked) amounts.</p>
                </div>
              )}

              <div className="mt-auto">
                {message && <div className={`mb-3 p-3 rounded-xl text-sm text-center border ${message.ok ? "bg-[#34d399]/10 border-[#34d399]/30 text-[#34d399]" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>{message.text}</div>}
                <button onClick={() => callApi("withdraw")} disabled={isLoading || !amount || parseFloat(amount) <= 0}
                  className="w-full py-4 rounded-xl font-bold text-white flex justify-center items-center gap-2 disabled:opacity-40 disabled:pointer-events-none transition-transform hover:scale-[1.02] active:scale-[0.98] bg-white/10 border border-white/10 hover:bg-white/15">
                  {isLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Unlock size={16} /> Confirm Withdrawal</>}
                </button>
              </div>
            </>
          )}

        </div>
      </div>
    </>
  );
}
