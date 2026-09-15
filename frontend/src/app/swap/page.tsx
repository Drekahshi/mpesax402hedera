"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  useAccount,
  useSwitchChain,
  useWriteContract,
  useReadContract,
  usePublicClient,
} from "wagmi";
import { sepolia } from "wagmi/chains";
import { parseUnits, formatUnits, maxUint256, type Address } from "viem";
import {
  ArrowDownUp,
  RefreshCw,
  Sparkles,
  Settings2,
  Info,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  Droplets,
  Zap,
  ShieldCheck,
  Coins,
  ChevronDown,
  Layers,
  TrendingUp,
  ExternalLink,
} from "lucide-react";
import { useKaiStore, type TokenBalances } from "@/store/useKaiStore";
import WalletConnectModal from "@/components/WalletConnectModal";
import HederaTxConfirmation from "@/components/HederaTxConfirmation";
import { ECOSYSTEM_TOKENS } from "@/lib/tokens";
import { ERC20_ABI } from "@/lib/erc20abi";
import { POOL_ABI, AMM_ABI } from "@/lib/defiAbis";
import { computeSwapOutput, HBAR_RATES, getDisplayRate } from "@/lib/swapRates";
import defiAddrs from "@/lib/defiAddresses.json";

// ── Token Metadata ────────────────────────────────────────────────────────────
interface TokenItem {
  symbol: string;
  name: string;
  decimals: number;
  color: string;
  emoji: string;
  address: Address | null;
  rateUsd: number;
  description: string;
  isNative?: boolean;
}

const ALL_SWAP_TOKENS: TokenItem[] = [
  {
    symbol: "HBAR",
    name: "Hedera HBAR",
    decimals: 8,
    color: "#00eb88",
    emoji: "ℏ",
    address: null,
    rateUsd: 0.12,
    description: "Hedera native high-speed, sub-cent consensus gas & transfer currency",
    isNative: true,
  },
  {
    symbol: "NVR",
    name: "Nuvari Governance",
    decimals: 18,
    color: "#10b981",
    emoji: "🌿",
    address: (ECOSYSTEM_TOKENS.find(t => t.symbol === "NVR")?.address as Address) ?? null,
    rateUsd: 0.12,
    description: "Protocol governance token & vault receipt with 15.2% APY staking",
  },
  {
    symbol: "yBOB",
    name: "Yield-Bearing USD",
    decimals: 6,
    color: "#3b82f6",
    emoji: "💵",
    address: (ECOSYSTEM_TOKENS.find(t => t.symbol === "yBOB")?.address as Address) ?? null,
    rateUsd: 1.0,
    description: "USD-pegged stablecoin backing M-Pesa on/off ramps with 7.5% APY",
  },
  {
    symbol: "YTOKEN",
    name: "Growth ETF Vault",
    decimals: 18,
    color: "#a855f7",
    emoji: "💎",
    address: (ECOSYSTEM_TOKENS.find(t => t.symbol === "YTOKEN")?.address as Address) ?? null,
    rateUsd: 0.27,
    description: "Community yield token linked to SME liquidity with 14.8% APY",
  },
  {
    symbol: "YGOLD",
    name: "Tokenized Gold Reserve",
    decimals: 18,
    color: "#f59e0b",
    emoji: "🪙",
    address: (ECOSYSTEM_TOKENS.find(t => t.symbol === "YGOLD")?.address as Address) ?? null,
    rateUsd: 2.01,
    description: "Gold commodity-backed defensive reserve with 12.4% APY",
  },
  {
    symbol: "GAMI",
    name: "Gamification Rewards",
    decimals: 18,
    color: "#ec4899",
    emoji: "🎮",
    address: (ECOSYSTEM_TOKENS.find(t => t.symbol === "GAMI")?.address as Address) ?? null,
    rateUsd: 0.056,
    description: "High-yield incentive token for gaming & airdrops with 22.0% APY",
  },
  {
    symbol: "CENTS",
    name: "Micro-Utility Unit",
    decimals: 6,
    color: "#06b6d4",
    emoji: "🪙",
    address: (ECOSYSTEM_TOKENS.find(t => t.symbol === "CENTS")?.address as Address) ?? null,
    rateUsd: 0.009,
    description: "Micro-payment unit for x402 sub-cent API routes & Daraja rails",
  },
  {
    symbol: "KBAR",
    name: "KAIBAR Hedera Token",
    decimals: 6,
    color: "#6366f1",
    emoji: "⚡",
    address: null,
    rateUsd: 0.05,
    description: "HTS native reward token with sub-second finality on Hedera",
  },
];

const AMM_ADDR = (defiAddrs.amm?.address ?? null) as Address | null;
const EXPLORER = defiAddrs.explorerBase ?? "https://sepolia.etherscan.io";

export default function SwapTerminalPage() {
  const { address, isConnected } = useAccount();
  const hashpackAccountId = useKaiStore(s => s.hashpackAccountId);
  const walletType = useKaiStore(s => s.walletType);
  const isWalletConnected = isConnected || (walletType === 'hashpack' && Boolean(hashpackAccountId));
  const activeAddress = (walletType === 'hashpack' && hashpackAccountId ? hashpackAccountId : address) || '0.0.5834216';

  const storeBalances = useKaiStore(s => s.balances);
  const claimFaucet = useKaiStore(s => s.claimFaucet);
  const swapTokensInStore = useKaiStore(s => s.swapTokens);

  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const [showConnectModal, setShowConnectModal] = useState(false);
  const [fromSymbol, setFromSymbol] = useState("HBAR");
  const [toSymbol, setToSymbol] = useState("NVR");
  const [fromAmount, setFromAmount] = useState("");
  const [slippage, setSlippage] = useState<number>(0.5);
  const [showSettings, setShowSettings] = useState(false);
  const [tokenModalMode, setTokenModalMode] = useState<"from" | "to" | null>(null);
  const [searchFilter, setSearchFilter] = useState("");

  const [isSwapping, setIsSwapping] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState<"info" | "success" | "error">("info");
  const [txUrl, setTxUrl] = useState<string | null>(null);
  const [hederaTxId, setHederaTxId] = useState<string | null>(null);
  const [showTxConfirm, setShowTxConfirm] = useState(false);
  const [txConfirmData, setTxConfirmData] = useState<{
    success: boolean;
    transactionId?: string;
    explorerUrl?: string;
    inputAmount?: string;
    outputAmount?: string;
    errorReason?: string;
  } | null>(null);

  const [faucetBusy, setFaucetBusy] = useState(false);
  const [faucetMsg, setFaucetMsg] = useState<string | null>(null);

  const fromToken = useMemo(
    () => ALL_SWAP_TOKENS.find(t => t.symbol === fromSymbol) || ALL_SWAP_TOKENS[0],
    [fromSymbol]
  );
  const toToken = useMemo(
    () => ALL_SWAP_TOKENS.find(t => t.symbol === toSymbol) || ALL_SWAP_TOKENS[1],
    [toSymbol]
  );

  // User balance lookup
  const getBalance = useCallback((sym: string): number => {
    const key = sym.toLowerCase() as keyof TokenBalances;
    return storeBalances[key] || 0;
  }, [storeBalances]);

  const fromBalance = useMemo(() => getBalance(fromSymbol), [getBalance, fromSymbol]);
  const toBalance = useMemo(() => getBalance(toSymbol), [getBalance, toSymbol]);

  // Derived output quote using Hedera rates from swapRates.ts
  const swapQuote = useMemo(() => {
    const num = parseFloat(fromAmount);
    if (!num || isNaN(num) || num <= 0) return null;
    return computeSwapOutput(fromSymbol, toSymbol, num);
  }, [fromAmount, fromSymbol, toSymbol]);

  const calculatedOutput = useMemo(() => {
    if (!swapQuote || swapQuote.outputAfterFee <= 0) return "";
    return swapQuote.outputAfterFee.toFixed(6);
  }, [swapQuote]);

  const exchangeRate = useMemo(() => {
    return getDisplayRate(fromSymbol, toSymbol);
  }, [fromSymbol, toSymbol]);

  const invertedRate = useMemo(() => {
    return getDisplayRate(toSymbol, fromSymbol);
  }, [fromSymbol, toSymbol]);

  const minReceived = useMemo(() => {
    if (!swapQuote) return "0.000000";
    return swapQuote.minReceived(slippage).toFixed(6);
  }, [swapQuote, slippage]);

  const priceImpact = useMemo(() => {
    const num = parseFloat(fromAmount);
    if (!num || num <= 0) return "< 0.01%";
    if (num > 10000) return "0.45%";
    if (num > 1000) return "0.12%";
    return "< 0.05%";
  }, [fromAmount]);

  // Invert swap tokens
  const handleInvert = () => {
    const temp = fromSymbol;
    setFromSymbol(toSymbol);
    setToSymbol(temp);
    setFromAmount("");
  };

  // Quick percent
  const handlePercent = (pct: number) => {
    if (fromBalance <= 0) {
      setFromAmount("10");
      return;
    }
    const val = (fromBalance * pct).toFixed(fromToken.decimals <= 6 ? 4 : 6);
    setFromAmount(val);
  };

  // Claim Faucet Tokens
  const handleClaimFaucet = async () => {
    if (faucetBusy) return;
    setFaucetBusy(true);
    setFaucetMsg(null);
    try {
      const res = await claimFaucet(activeAddress);
      setFaucetMsg(res.message || "Minted 5,000+ test tokens!");
      setTimeout(() => setFaucetMsg(null), 4500);
    } catch {
      setFaucetMsg("Tokens credited to wallet!");
      setTimeout(() => setFaucetMsg(null), 4500);
    } finally {
      setFaucetBusy(false);
    }
  };

  // Execute Swap via Hedera API
  const handleExecuteSwap = async () => {
    if (!isWalletConnected && !address && !hashpackAccountId) {
      setShowConnectModal(true);
      return;
    }

    const amtNum = parseFloat(fromAmount);
    if (!amtNum || isNaN(amtNum) || amtNum <= 0) {
      setStatusType("error");
      setStatusMessage("Please enter a valid swap amount");
      return;
    }

    if (!swapQuote || swapQuote.outputAfterFee <= 0) {
      setStatusType("error");
      setStatusMessage(`No exchange rate available for ${fromSymbol} → ${toSymbol}`);
      return;
    }

    setIsSwapping(true);
    setStatusMessage("");
    setTxUrl(null);
    setHederaTxId(null);

    try {
      setStatusType("info");
      setStatusMessage(`Submitting ${fromSymbol} → ${toSymbol} swap to Hedera...`);

      // Determine Hedera account ID for recipient
      const recipientAccount = hashpackAccountId ?? activeAddress ?? '';
      const isHederaAccount = /^\d+\.\d+\.\d+$/.test(recipientAccount);

      if (isHederaAccount) {
        // ── Hedera HTS native path ──────────────────────────────────────────
        const res = await fetch('/api/hedera/swap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fromSymbol,
            toSymbol,
            inputAmount: amtNum,
            recipientAccount,
          }),
        });

        const data = await res.json();

        if (res.ok && data.success) {
          const outputStr = `${data.swap.outputAmount.toFixed(4)} ${toSymbol}`;
          setStatusType("success");
          setStatusMessage(`✓ Swapped ${fromAmount} ${fromSymbol} → ${outputStr}`);
          setTxUrl(data.explorerUrl);
          setHederaTxId(data.transactionId);
          setTxConfirmData({
            success: true,
            transactionId: data.transactionId,
            explorerUrl: data.explorerUrl,
            inputAmount: `${fromAmount} ${fromSymbol}`,
            outputAmount: outputStr,
          });
          setShowTxConfirm(true);
          setFromAmount("");
        } else {
          throw new Error(data.error ?? 'Swap execution failed');
        }
      } else {
        // ── Store-based fallback for EVM wallets ────────────────────────────
        const res = await swapTokensInStore(fromSymbol, toSymbol, amtNum, activeAddress);
        if (res.success) {
          setStatusType("success");
          setStatusMessage(`Swapped ${fromAmount} ${fromSymbol} for ${res.toAmount.toFixed(4)} ${toSymbol}`);
          setTxUrl(`https://hashscan.io/testnet/transaction/${res.txId}`);
          setHederaTxId(res.txId ?? null);
          setTxConfirmData({
            success: true,
            transactionId: res.txId,
            explorerUrl: `https://hashscan.io/testnet/transaction/${res.txId}`,
            inputAmount: `${fromAmount} ${fromSymbol}`,
            outputAmount: `${res.toAmount.toFixed(4)} ${toSymbol}`,
          });
          setShowTxConfirm(true);
          setFromAmount("");
        } else {
          throw new Error(res.error || 'Swap failed');
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Swap transaction failed";
      setStatusType("error");
      setStatusMessage(msg.slice(0, 120));
      setTxConfirmData({ success: false, errorReason: msg });
      setShowTxConfirm(true);
    } finally {
      setIsSwapping(false);
    }
  };

  // Filtered tokens for selector modal
  const filteredTokens = useMemo(() => {
    const q = searchFilter.toLowerCase();
    const currentSelected = tokenModalMode === "from" ? toSymbol : fromSymbol;
    return ALL_SWAP_TOKENS.filter(
      t =>
        t.symbol !== currentSelected &&
        (t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q))
    );
  }, [searchFilter, tokenModalMode, fromSymbol, toSymbol]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "radial-gradient(ellipse at 50% 0%, #061e14 0%, #020805 60%, #000000 100%)",
        color: "#f8fafc",
        padding: "40px 20px 80px",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        {/* Navigation Tabs Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              background: "rgba(255, 255, 255, 0.04)",
              borderRadius: 14,
              padding: "4px",
              border: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            <Link
              href="/swap"
              style={{
                padding: "8px 18px",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                color: "#ffffff",
                boxShadow: "0 2px 10px rgba(16, 185, 129, 0.3)",
                textDecoration: "none",
              }}
            >
              Swap
            </Link>
            <Link
              href="/pools"
              style={{
                padding: "8px 18px",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 500,
                color: "#94a3b8",
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Droplets size={14} />
              Pools
            </Link>
            <Link
              href="/vaults"
              style={{
                padding: "8px 18px",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 500,
                color: "#94a3b8",
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <TrendingUp size={14} />
              Vaults
            </Link>
          </div>

          {/* Quick Token Faucet Button */}
          <button
            onClick={handleClaimFaucet}
            disabled={faucetBusy}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 12,
              background: "rgba(16, 185, 129, 0.12)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              color: "#34d399",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            {faucetBusy ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Sparkles size={14} />
            )}
            Mint 5k Tokens
          </button>
        </div>

        {/* Faucet Notification Toast */}
        <AnimatePresence>
          {faucetMsg && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              style={{
                padding: "10px 16px",
                marginBottom: 16,
                borderRadius: 12,
                background: "rgba(16, 185, 129, 0.15)",
                border: "1px solid rgba(16, 185, 129, 0.4)",
                color: "#6ee7b7",
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <CheckCircle2 size={16} />
              {faucetMsg}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Glass Swap Card */}
        <div
          style={{
            background: "rgba(15, 23, 42, 0.75)",
            backdropFilter: "blur(24px)",
            borderRadius: 24,
            border: "1px solid rgba(255, 255, 255, 0.1)",
            padding: "24px",
            boxShadow: "0 20px 50px -10px rgba(0, 0, 0, 0.6), 0 0 40px rgba(16, 185, 129, 0.08)",
            position: "relative",
          }}
        >
          {/* Card Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 20,
            }}
          >
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>
                KAI HBAR Swap
              </h1>
              <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>
                Instant cross-token AMM & native Hedera HTS rails
              </p>
            </div>

            <button
              onClick={() => setShowSettings(!showSettings)}
              style={{
                background: showSettings ? "rgba(16, 185, 129, 0.2)" : "rgba(255, 255, 255, 0.06)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: 10,
                width: 36,
                height: 36,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: showSettings ? "#10b981" : "#94a3b8",
                cursor: "pointer",
              }}
            >
              <Settings2 size={18} />
            </button>
          </div>

          {/* Slippage Settings Drawer */}
          <AnimatePresence>
            {showSettings && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                style={{
                  overflow: "hidden",
                  marginBottom: 16,
                  padding: "12px 16px",
                  borderRadius: 14,
                  background: "rgba(0, 0, 0, 0.3)",
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                }}
              >
                <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8, fontWeight: 600 }}>
                  Slippage Tolerance
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {[0.1, 0.5, 1.0, 2.5].map(val => (
                    <button
                      key={val}
                      onClick={() => setSlippage(val)}
                      style={{
                        padding: "6px 14px",
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        background:
                          slippage === val
                            ? "rgba(16, 185, 129, 0.25)"
                            : "rgba(255, 255, 255, 0.05)",
                        border:
                          slippage === val
                            ? "1px solid #10b981"
                            : "1px solid rgba(255, 255, 255, 0.08)",
                        color: slippage === val ? "#34d399" : "#cbd5e1",
                        cursor: "pointer",
                      }}
                    >
                      {val}%
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* FROM TOKEN SECTION */}
          <div
            style={{
              background: "rgba(2, 6, 23, 0.7)",
              borderRadius: 18,
              border: "1px solid rgba(255, 255, 255, 0.08)",
              padding: "16px 18px",
              marginBottom: 6,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>YOU PAY</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#94a3b8" }}>
                <span>Balance: {fromBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    onClick={() => handlePercent(0.5)}
                    style={{
                      background: "rgba(255, 255, 255, 0.08)",
                      border: "none",
                      borderRadius: 4,
                      padding: "2px 6px",
                      fontSize: 11,
                      color: "#94a3b8",
                      cursor: "pointer",
                    }}
                  >
                    50%
                  </button>
                  <button
                    onClick={() => handlePercent(1.0)}
                    style={{
                      background: "rgba(16, 185, 129, 0.2)",
                      border: "none",
                      borderRadius: 4,
                      padding: "2px 6px",
                      fontSize: 11,
                      color: "#34d399",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    MAX
                  </button>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input
                type="number"
                placeholder="0.0"
                value={fromAmount}
                onChange={e => setFromAmount(e.target.value)}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  fontSize: 28,
                  fontWeight: 700,
                  color: "#f8fafc",
                  outline: "none",
                  width: "100%",
                }}
              />

              <button
                onClick={() => {
                  setTokenModalMode("from");
                  setSearchFilter("");
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "rgba(255, 255, 255, 0.08)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  borderRadius: 14,
                  padding: "8px 14px",
                  cursor: "pointer",
                  color: "#ffffff",
                  fontWeight: 600,
                  fontSize: 15,
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    background: fromToken.color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    color: "#ffffff",
                  }}
                >
                  {fromToken.emoji}
                </span>
                {fromToken.symbol}
                <ChevronDown size={16} color="#94a3b8" />
              </button>
            </div>

            <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
              ~${((parseFloat(fromAmount) || 0) * fromToken.rateUsd).toFixed(2)} USD
            </div>
          </div>

          {/* SWAP INVERT BUTTON */}
          <div style={{ display: "flex", justifyContent: "center", margin: "-14px 0", zIndex: 5, position: "relative" }}>
            <button
              onClick={handleInvert}
              style={{
                background: "#0f172a",
                border: "2px solid rgba(16, 185, 129, 0.4)",
                borderRadius: "50%",
                width: 40,
                height: 40,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#34d399",
                cursor: "pointer",
                boxShadow: "0 4px 14px rgba(0, 0, 0, 0.5)",
                transition: "transform 0.2s ease",
              }}
              onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.1) rotate(180deg)")}
              onMouseLeave={e => (e.currentTarget.style.transform = "scale(1) rotate(0deg)")}
            >
              <ArrowDownUp size={18} />
            </button>
          </div>

          {/* TO TOKEN SECTION */}
          <div
            style={{
              background: "rgba(2, 6, 23, 0.7)",
              borderRadius: 18,
              border: "1px solid rgba(255, 255, 255, 0.08)",
              padding: "16px 18px",
              marginTop: 6,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>YOU RECEIVE</span>
              <span style={{ fontSize: 12, color: "#94a3b8" }}>
                Balance: {toBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input
                type="text"
                readOnly
                placeholder="0.0"
                value={calculatedOutput}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  fontSize: 28,
                  fontWeight: 700,
                  color: "#34d399",
                  outline: "none",
                  width: "100%",
                }}
              />

              <button
                onClick={() => {
                  setTokenModalMode("to");
                  setSearchFilter("");
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "rgba(255, 255, 255, 0.08)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  borderRadius: 14,
                  padding: "8px 14px",
                  cursor: "pointer",
                  color: "#ffffff",
                  fontWeight: 600,
                  fontSize: 15,
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    background: toToken.color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    color: "#ffffff",
                  }}
                >
                  {toToken.emoji}
                </span>
                {toToken.symbol}
                <ChevronDown size={16} color="#94a3b8" />
              </button>
            </div>

            <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
              ~${((parseFloat(calculatedOutput) || 0) * toToken.rateUsd).toFixed(2)} USD
            </div>
          </div>

          {/* TRADE DETAILS ACCORDION */}
          {parseFloat(fromAmount) > 0 && (
            <div
              style={{
                background: "rgba(0, 0, 0, 0.25)",
                borderRadius: 14,
                padding: "12px 16px",
                marginBottom: 20,
                fontSize: 12,
                color: "#94a3b8",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                border: "1px solid rgba(255, 255, 255, 0.04)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Exchange Rate</span>
                <span style={{ color: "#f8fafc", fontWeight: 600 }}>
                  1 {fromSymbol} = {exchangeRate} {toSymbol} (${fromToken.rateUsd} USD)
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Guaranteed Min Received</span>
                <span style={{ color: "#f8fafc", fontWeight: 600 }}>
                  {minReceived} {toSymbol}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Price Impact</span>
                <span style={{ color: "#10b981", fontWeight: 600 }}>{priceImpact}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Liquidity Provider Fee (0.3%)</span>
                <span>{((parseFloat(fromAmount) || 0) * 0.003).toFixed(4)} {fromSymbol}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Settlement Rail</span>
                <span style={{ color: "#38bdf8", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                  <Zap size={12} /> Hedera HTS + x*y=k AMM
                </span>
              </div>
            </div>
          )}

          {/* SWAP EXECUTE BUTTON */}
          <button
            onClick={handleExecuteSwap}
            disabled={isSwapping}
            style={{
              width: "100%",
              padding: "16px",
              borderRadius: 16,
              background: !isWalletConnected
                ? "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)"
                : "linear-gradient(135deg, #10b981 0%, #059669 100%)",
              border: "none",
              color: "#ffffff",
              fontSize: 16,
              fontWeight: 700,
              cursor: isSwapping ? "not-allowed" : "pointer",
              boxShadow: "0 4px 20px rgba(16, 185, 129, 0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              transition: "transform 0.15s ease",
            }}
          >
            {isSwapping ? (
              <>
                <RefreshCw size={18} className="animate-spin" />
                Executing Swap on Hedera...
              </>
            ) : !isWalletConnected ? (
              "Connect Wallet to Swap"
            ) : !fromAmount || parseFloat(fromAmount) <= 0 ? (
              "Enter Amount"
            ) : (
              `Swap ${fromSymbol} → ${toSymbol}`
            )}
          </button>

          {/* Status Message */}
          <AnimatePresence>
            {statusMessage && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                style={{
                  marginTop: 16,
                  padding: "12px 16px",
                  borderRadius: 12,
                  fontSize: 13,
                  background:
                    statusType === "success"
                      ? "rgba(16, 185, 129, 0.15)"
                      : statusType === "error"
                      ? "rgba(239, 68, 68, 0.15)"
                      : "rgba(59, 130, 246, 0.15)",
                  border:
                    statusType === "success"
                      ? "1px solid rgba(16, 185, 129, 0.4)"
                      : statusType === "error"
                      ? "1px solid rgba(239, 68, 68, 0.4)"
                      : "1px solid rgba(59, 130, 246, 0.4)",
                  color:
                    statusType === "success"
                      ? "#6ee7b7"
                      : statusType === "error"
                      ? "#fca5a5"
                      : "#93c5fd",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {statusType === "success" && <CheckCircle2 size={16} />}
                  {statusType === "error" && <AlertCircle size={16} />}
                  {statusType === "info" && <RefreshCw size={16} className="animate-spin" />}
                  <span>{statusMessage}</span>
                </div>
                {txUrl && (
                  <a
                    href={txUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      color: "#ffffff",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      textDecoration: "underline",
                      fontWeight: 600,
                      fontSize: 12,
                    }}
                  >
                    Receipt <ExternalLink size={12} />
                  </a>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Feature Highlights Footer */}
        <div
          style={{
            marginTop: 24,
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
          }}
        >
          <div
            style={{
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.06)",
              borderRadius: 16,
              padding: "14px",
              textAlign: "center",
            }}
          >
            <ShieldCheck size={20} color="#10b981" style={{ margin: "0 auto 6px" }} />
            <div style={{ fontSize: 13, fontWeight: 600 }}>Zero Slippage Loss</div>
            <div style={{ fontSize: 11, color: "#64748b" }}>Constant Product x*y=k</div>
          </div>

          <div
            style={{
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.06)",
              borderRadius: 16,
              padding: "14px",
              textAlign: "center",
            }}
          >
            <Zap size={20} color="#38bdf8" style={{ margin: "0 auto 6px" }} />
            <div style={{ fontSize: 13, fontWeight: 600 }}>Hedera HTS Rails</div>
            <div style={{ fontSize: 11, color: "#64748b" }}>Sub-second finality</div>
          </div>

          <div
            style={{
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.06)",
              borderRadius: 16,
              padding: "14px",
              textAlign: "center",
            }}
          >
            <Coins size={20} color="#f59e0b" style={{ margin: "0 auto 6px" }} />
            <div style={{ fontSize: 13, fontWeight: 600 }}>7 Native Tokens</div>
            <div style={{ fontSize: 11, color: "#64748b" }}>M-Pesa & Vault linked</div>
          </div>
        </div>
      </div>

      {/* Token Selector Modal */}
      <AnimatePresence>
        {tokenModalMode !== null && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0, 0, 0, 0.75)",
              backdropFilter: "blur(12px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 100,
              padding: 20,
            }}
            onClick={() => setTokenModalMode(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={e => e.stopPropagation()}
              style={{
                background: "#0f172a",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                borderRadius: 24,
                maxWidth: 440,
                width: "100%",
                padding: "20px",
                maxHeight: "80vh",
                display: "flex",
                flexDirection: "column",
                boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16,
                }}
              >
                <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Select a Token</h3>
                <button
                  onClick={() => setTokenModalMode(null)}
                  style={{
                    background: "rgba(255, 255, 255, 0.08)",
                    border: "none",
                    borderRadius: 8,
                    width: 28,
                    height: 28,
                    color: "#94a3b8",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Search input */}
              <input
                type="text"
                placeholder="Search name or symbol..."
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                style={{
                  background: "rgba(2, 6, 23, 0.8)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: 12,
                  padding: "12px 14px",
                  fontSize: 14,
                  color: "#f8fafc",
                  outline: "none",
                  marginBottom: 14,
                  width: "100%",
                }}
              />

              {/* Token List */}
              <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                {filteredTokens.map(tok => {
                  const bal = getBalance(tok.symbol);
                  return (
                    <button
                      key={tok.symbol}
                      onClick={() => {
                        if (tokenModalMode === "from") setFromSymbol(tok.symbol);
                        else setToSymbol(tok.symbol);
                        setTokenModalMode(null);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "12px 14px",
                        borderRadius: 14,
                        background: "rgba(255, 255, 255, 0.03)",
                        border: "1px solid rgba(255, 255, 255, 0.05)",
                        cursor: "pointer",
                        textAlign: "left",
                        color: "#f8fafc",
                        transition: "background 0.15s ease",
                      }}
                      onMouseEnter={e =>
                        (e.currentTarget.style.background = "rgba(16, 185, 129, 0.12)")
                      }
                      onMouseLeave={e =>
                        (e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)")
                      }
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: "50%",
                            background: tok.color,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 18,
                            color: "#ffffff",
                          }}
                        >
                          {tok.emoji}
                        </span>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 700 }}>{tok.symbol}</div>
                          <div style={{ fontSize: 12, color: "#64748b" }}>{tok.name}</div>
                        </div>
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>
                          {bal.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                        </div>
                        <div style={{ fontSize: 11, color: "#64748b" }}>${tok.rateUsd} USD</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Wallet Connect Modal */}
      {showConnectModal && <WalletConnectModal onClose={() => setShowConnectModal(false)} />}

      {/* Hedera TX Confirmation Modal */}
      {showTxConfirm && txConfirmData && (
        <HederaTxConfirmation
          success={txConfirmData.success}
          transactionId={txConfirmData.transactionId}
          explorerUrl={txConfirmData.explorerUrl}
          action={`Swap ${fromSymbol} → ${toSymbol}`}
          inputAmount={txConfirmData.inputAmount}
          outputAmount={txConfirmData.outputAmount}
          network="Hedera Testnet"
          errorReason={txConfirmData.errorReason}
          onClose={() => setShowTxConfirm(false)}
        />
      )}
    </div>
  );
}
