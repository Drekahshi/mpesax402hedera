"use client";

/**
 * Vaults page — real on-chain KaiVault interactions on Sepolia / Hedera Testnet.
 *
 * Each vault is a deployed KaiVault contract.  The user:
 *   1. Approves the vault contract to spend their ERC-20 tokens
 *   2. Calls deposit(amount)  → receives kvTOKEN share tokens
 *   3. Calls withdraw(shares) → burns shares, receives tokens + yield
 *
 * Contract addresses come from src/lib/defiAddresses.json, written by
 *   npx hardhat run scripts/deploy-defi.ts --network sepolia
 */

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  useAccount, useSwitchChain, useWriteContract,
  useReadContracts, usePublicClient,
} from "wagmi";
import { sepolia } from "wagmi/chains";
import { parseUnits, formatUnits, maxUint256 } from "viem";
import {
  ArrowLeft, ExternalLink, RefreshCw,
  ChevronDown, ChevronUp, Shield,
} from "lucide-react";
import WalletConnectModal from "@/components/WalletConnectModal";
import { ECOSYSTEM_TOKENS } from "@/lib/tokens";
import { ERC20_ABI } from "@/lib/erc20abi";
import { VAULT_ABI } from "@/lib/defiAbis";
import defiAddrs from "@/lib/defiAddresses.json";

// ─── Types ────────────────────────────────────────────────────────────────────
interface VaultEntry {
  symbol:     string;
  name:       string;
  color:      string;
  emoji:      string;
  apyPct:     string;
  vaultAddr:  `0x${string}` | null;
  tokenAddr:  `0x${string}` | null;
  decimals:   number;
}

// ─── Build vault list from defiAddresses.json + ECOSYSTEM_TOKENS ──────────────
const VAULTS: VaultEntry[] = (["NVR","yBOB","YTOKEN","YGOLD","GAMI","CENTS"] as const).map(sym => {
  const tok  = ECOSYSTEM_TOKENS.find(t => t.symbol === sym);
  const info = (defiAddrs.vaults as Record<string, { address: string | null; apyPct: string }>)[sym];
  return {
    symbol:    sym,
    name:      tok?.name     ?? sym,
    color:     tok?.color    ?? "#10b981",
    emoji:     tok?.emoji    ?? "",
    apyPct:    info?.apyPct  ?? "-",
    vaultAddr: (info?.address as `0x${string}` | null) ?? null,
    tokenAddr: (tok?.address ?? null) as `0x${string}` | null,
    decimals:  tok?.decimals ?? 18,
  };
});

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function VaultsPage() {
  const { address, isConnected } = useAccount();
  const { switchChainAsync }     = useSwitchChain();
  const { writeContractAsync }   = useWriteContract();
  const publicClient             = usePublicClient();

  const [showModal,   setShowModal]  = useState(false);
  const [activeVault, setActiveVault]= useState<string | null>(null);
  const [mode,        setMode]       = useState<"deposit" | "withdraw">("deposit");
  const [inputAmt,    setInputAmt]   = useState("");
  const [statusMsg,   setStatusMsg]  = useState("");
  const [txUrl,       setTxUrl]      = useState<string | null>(null);
  const [busy,        setBusy]       = useState(false);

  // ── Read on-chain: token balances + vault share balances + share prices ────
  const deployed = VAULTS.filter(v => v.tokenAddr && v.vaultAddr);

  const tokenBalCalls = deployed.map(v => ({
    address: v.tokenAddr!, abi: ERC20_ABI,
    functionName: "balanceOf" as const, args: [address ?? "0x0000000000000000000000000000000000000000" as `0x${string}`],
  }));
  const shareCalls = deployed.map(v => ({
    address: v.vaultAddr!, abi: VAULT_ABI,
    functionName: "balanceOf" as const, args: [address ?? "0x0000000000000000000000000000000000000000" as `0x${string}`],
  }));
  const priceCalls = deployed.map(v => ({
    address: v.vaultAddr!, abi: VAULT_ABI, functionName: "sharePrice" as const, args: [],
  }));
  const tvlCalls = deployed.map(v => ({
    address: v.vaultAddr!, abi: VAULT_ABI, functionName: "totalAssets" as const, args: [],
  }));

  const { data: tokenBals,  refetch: refetchBals }   = useReadContracts({ contracts: tokenBalCalls,  query: { enabled: !!address } });
  const { data: shareBals,  refetch: refetchShares }  = useReadContracts({ contracts: shareCalls,    query: { enabled: !!address } });
  const { data: sharePrices,refetch: refetchPrices }  = useReadContracts({ contracts: priceCalls,    query: { enabled: true } });
  const { data: tvlData,    refetch: refetchTvl }     = useReadContracts({ contracts: tvlCalls,      query: { enabled: true } });

  const handleRefresh = useCallback(async () => {
    await Promise.allSettled([refetchBals(), refetchShares(), refetchPrices(), refetchTvl()]);
  }, [refetchBals, refetchShares, refetchPrices, refetchTvl]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const idx = (sym: string) => deployed.findIndex(v => v.symbol === sym);

  const tokenBal = (sym: string): bigint => {
    const i = idx(sym); if (i < 0) return 0n;
    return (tokenBals?.[i]?.result as bigint | undefined) ?? 0n;
  };
  const shareBal = (sym: string): bigint => {
    const i = idx(sym); if (i < 0) return 0n;
    return (shareBals?.[i]?.result as bigint | undefined) ?? 0n;
  };
  const sharePrice = (sym: string): bigint => {
    const i = idx(sym); if (i < 0) return 10n ** 18n;
    return (sharePrices?.[i]?.result as bigint | undefined) ?? 10n ** 18n;
  };
  const tvl = (sym: string): bigint => {
    const i = idx(sym); if (i < 0) return 0n;
    return (tvlData?.[i]?.result as bigint | undefined) ?? 0n;
  };
  const fmtToken = (raw: bigint, dec: number) =>
    parseFloat(formatUnits(raw, dec)).toLocaleString(undefined, { maximumFractionDigits: 4 });

  // ── Deposit flow: approve → deposit ───────────────────────────────────────
  const handleDeposit = async (vault: VaultEntry) => {
    if (!isConnected || !address) { setShowModal(true); return; }
    if (!vault.vaultAddr || !vault.tokenAddr) { setStatusMsg("Vault not deployed yet. Run deploy-defi.ts first."); return; }
    const amt = parseFloat(inputAmt);
    if (!amt || amt <= 0) { setStatusMsg("Enter an amount."); return; }

    const amtWei = parseUnits(inputAmt, vault.decimals);
    setBusy(true); setStatusMsg(""); setTxUrl(null);

    try {
      await switchChainAsync({ chainId: sepolia.id });

      // Step 1: approve vault to spend tokens
      setStatusMsg(`Approving ${vault.symbol} spend...`);
      const approveTx = await writeContractAsync({
        address: vault.tokenAddr, abi: ERC20_ABI,
        functionName: "approve", args: [vault.vaultAddr, maxUint256],
        chainId: sepolia.id,
      });
      setStatusMsg("Waiting for approval confirmation...");
      await publicClient?.waitForTransactionReceipt({ hash: approveTx });

      // Step 2: deposit
      setStatusMsg(`Depositing ${inputAmt} ${vault.symbol} into vault...`);
      const depositTx = await writeContractAsync({
        address: vault.vaultAddr, abi: VAULT_ABI,
        functionName: "deposit", args: [amtWei],
        chainId: sepolia.id,
      });
      setTxUrl(`https://sepolia.etherscan.io/tx/${depositTx}`);
      setStatusMsg(`Deposited ${inputAmt} ${vault.symbol}! You received kv${vault.symbol} shares.`);
      setInputAmt("");
      await handleRefresh();
    } catch (e: unknown) {
      setStatusMsg(`${e instanceof Error ? e.message.slice(0, 120) : "Transaction failed"}`);
    } finally {
      setBusy(false);
    }
  };

  // ── Withdraw flow: approve shares → withdraw ───────────────────────────────
  const handleWithdraw = async (vault: VaultEntry) => {
    if (!isConnected || !address) { setShowModal(true); return; }
    if (!vault.vaultAddr) { setStatusMsg("Vault not deployed."); return; }
    const shares = parseFloat(inputAmt);
    if (!shares || shares <= 0) { setStatusMsg("Enter share amount to redeem."); return; }

    const sharesWei = parseUnits(inputAmt, vault.decimals);
    const bal = shareBal(vault.symbol);
    if (sharesWei > bal) { setStatusMsg(`You only have ${fmtToken(bal, vault.decimals)} kv${vault.symbol} shares.`); return; }

    setBusy(true); setStatusMsg(""); setTxUrl(null);

    try {
      await switchChainAsync({ chainId: sepolia.id });

      setStatusMsg(`Withdrawing ${inputAmt} shares from ${vault.symbol} vault...`);
      const withdrawTx = await writeContractAsync({
        address: vault.vaultAddr, abi: VAULT_ABI,
        functionName: "withdraw", args: [sharesWei],
        chainId: sepolia.id,
      });
      setTxUrl(`https://sepolia.etherscan.io/tx/${withdrawTx}`);
      setStatusMsg(`Redeemed ${inputAmt} kv${vault.symbol} shares - ${vault.symbol} tokens returned.`);
      setInputAmt("");
      await handleRefresh();
    } catch (e: unknown) {
      setStatusMsg(`${e instanceof Error ? e.message.slice(0, 120) : "Transaction failed"}`);
    } finally {
      setBusy(false);
    }
  };

  const isNotDeployed = !defiAddrs.deployedAt;

  return (
    <main style={{ padding: "16px 16px 100px", display: "flex", flexDirection: "column", gap: 16, maxWidth: 520, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ paddingTop: 32, display: "flex", alignItems: "center", gap: 12 }}>
        <Link href="/" style={{
          width: 36, height: 36, borderRadius: "50%",
          background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)",
          display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none",
        }}>
          <ArrowLeft size={18} color="#10b981" />
        </Link>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: "#fff", margin: 0 }}>KAI Vaults</h1>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", margin: "3px 0 0" }}>
            Real ERC-20 yield vaults · Sepolia EVM · kvTOKEN shares
          </p>
        </div>
        <button onClick={handleRefresh} style={{
          background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)",
          borderRadius: 8, padding: 8, cursor: "pointer",
        }}>
          <RefreshCw size={16} color="#10b981" />
        </button>
      </div>

      {/* Not deployed warning */}
      {isNotDeployed && (
        <div style={{
          background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.3)",
          borderRadius: 14, padding: "14px 16px", fontSize: 12, color: "rgba(255,255,255,0.7)",
        }}>
          <strong style={{ color: "#F97316" }}>Vaults not deployed yet.</strong> Run this to deploy on Sepolia:
          <br /><code style={{ fontSize: 11, color: "#fbbf24", marginTop: 4, display: "block" }}>
            npx hardhat run scripts/deploy-defi.ts --network sepolia
          </code>
        </div>
      )}

      {/* Wallet connect prompt */}
      {!isConnected && (
        <button onClick={() => setShowModal(true)} style={{
          background: "rgba(16,185,129,0.08)", border: "1px dashed rgba(16,185,129,0.4)",
          borderRadius: 14, padding: "14px 16px", color: "#10b981",
          fontWeight: 700, fontSize: 13, cursor: "pointer",
        }}>
          Connect wallet to deposit / withdraw
        </button>
      )}

      {/* Status message */}
      {statusMsg && (
        <div style={{
          background: "rgba(34,197,94,0.08)",
          border: "1px solid rgba(34,197,94,0.2)",
          padding: "12px 14px", borderRadius: 12, fontSize: 12, color: "#fff",
        }}>
          {statusMsg}
          {txUrl && (
            <a href={txUrl} target="_blank" rel="noopener noreferrer"
              style={{ marginLeft: 8, color: "#60a5fa", display: "inline-flex", alignItems: "center", gap: 4 }}>
              Etherscan <ExternalLink size={11} />
            </a>
          )}
        </div>
      )}

      {/* Vault cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {VAULTS.map(vault => {
          const open       = activeVault === vault.symbol;
          const tBal       = tokenBal(vault.symbol);
          const sBal       = shareBal(vault.symbol);
          const sp         = sharePrice(vault.symbol);
          const tvlAmt     = tvl(vault.symbol);
          const hasShares  = sBal > 0n;
          const redeemVal  = hasShares ? (sBal * sp) / 10n ** 18n : 0n;

          return (
            <div key={vault.symbol} className="glass" style={{
              borderRadius: 20, overflow: "hidden",
              border: open ? `1px solid ${vault.color}55` : "1px solid rgba(255,255,255,0.08)",
              background: open ? `${vault.color}08` : "rgba(255,255,255,0.03)",
              transition: "all 0.2s ease",
            }}>

              {/* Header row */}
              <div
                onClick={() => { setActiveVault(open ? null : vault.symbol); setStatusMsg(""); setTxUrl(""); setInputAmt(""); }}
                style={{ padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: 14, fontSize: 22,
                  background: `${vault.color}20`, border: `1px solid ${vault.color}40`,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>{vault.emoji}</div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <p style={{ fontSize: 14, fontWeight: 800, color: "#fff", margin: 0 }}>{vault.name}</p>
                    {vault.vaultAddr && (
                      <span style={{ fontSize: 9, background: "rgba(34,197,94,0.12)", color: "#22C55E", padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>
                        ● LIVE
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", margin: "2px 0 0" }}>
                    kv{vault.symbol} shares · TVL {vault.tokenAddr ? fmtToken(tvlAmt, vault.decimals) : "-"} {vault.symbol}
                  </p>
                </div>

                <div style={{ textAlign: "right", display: "flex", alignItems: "center", gap: 8 }}>
                  <div>
                    <p style={{ fontSize: 16, fontWeight: 900, color: vault.color, margin: 0 }}>{vault.apyPct}</p>
                    <p style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", margin: 0 }}>APY</p>
                  </div>
                  {open ? <ChevronUp size={16} color="rgba(255,255,255,0.4)" /> : <ChevronDown size={16} color="rgba(255,255,255,0.4)" />}
                </div>
              </div>

              {/* Expanded panel */}
              {open && (
                <div style={{ padding: "0 16px 16px" }}>

                  {/* Your position */}
                  {isConnected && vault.vaultAddr && (
                    <div style={{
                      display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14,
                    }}>
                      {[
                        { label: `${vault.symbol} wallet`, value: `${fmtToken(tBal, vault.decimals)} ${vault.symbol}`, color: vault.color },
                        { label: `kv${vault.symbol} shares`, value: `${fmtToken(sBal, vault.decimals)}`, color: "#A78BFA" },
                        { label: "Share price",  value: `${parseFloat(formatUnits(sp, 18)).toFixed(6)} ${vault.symbol}`, color: "#FFD700" },
                        { label: "Redeem value", value: `${fmtToken(redeemVal, vault.decimals)} ${vault.symbol}`, color: "#22C55E" },
                      ].map(s => (
                        <div key={s.label} style={{
                          background: "rgba(0,0,0,0.25)", borderRadius: 10,
                          padding: "8px 12px", border: "1px solid rgba(255,255,255,0.06)",
                        }}>
                          <p style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", margin: "0 0 3px", fontWeight: 700, letterSpacing: 0.5 }}>
                            {s.label.toUpperCase()}
                          </p>
                          <p style={{ fontSize: 13, fontWeight: 800, color: s.color, margin: 0 }}>{s.value}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Contract link */}
                  {vault.vaultAddr && (
                    <a href={`https://sepolia.etherscan.io/address/${vault.vaultAddr}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 10, fontFamily: "monospace", color: "#60a5fa", display: "flex", alignItems: "center", gap: 4, marginBottom: 14, textDecoration: "none" }}>
                      {vault.vaultAddr} <ExternalLink size={10} />
                    </a>
                  )}

                  {/* Action tabs */}
                  <div style={{ display: "flex", gap: 6, marginBottom: 12, background: "rgba(0,0,0,0.2)", padding: 3, borderRadius: 10 }}>
                    {(["deposit", "withdraw"] as const).map(m => (
                      <button key={m} onClick={() => { setMode(m); setInputAmt(""); }}
                        style={{
                          flex: 1, padding: "7px 0", borderRadius: 7, fontSize: 12, fontWeight: 700,
                          background: mode === m ? vault.color : "transparent",
                          color: mode === m ? (["#FFD700","#EAB308","#22C55E","#86EFAC"].includes(vault.color) ? "#1B4332" : "#fff") : "rgba(255,255,255,0.5)",
                          border: "none", cursor: "pointer",
                        }}>
                        {m === "deposit" ? "Deposit" : "Withdraw Shares"}
                      </button>
                    ))}
                  </div>

                  {!vault.vaultAddr ? (
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textAlign: "center", padding: "12px 0" }}>
                      Deploy vaults first - run deploy-defi.ts
                    </p>
                  ) : (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 1 }}>
                          {mode === "deposit" ? `AMOUNT (${vault.symbol})` : `SHARES TO REDEEM (kv${vault.symbol})`}
                        </span>
                        {mode === "deposit" ? (
                          <button onClick={() => setInputAmt(formatUnits(tBal, vault.decimals))}
                            style={{ fontSize: 10, color: vault.color, background: "transparent", border: "none", cursor: "pointer", fontWeight: 700 }}>
                            MAX {fmtToken(tBal, vault.decimals)}
                          </button>
                        ) : (
                          <button onClick={() => setInputAmt(formatUnits(sBal, vault.decimals))}
                            style={{ fontSize: 10, color: "#A78BFA", background: "transparent", border: "none", cursor: "pointer", fontWeight: 700 }}>
                            ALL {fmtToken(sBal, vault.decimals)}
                          </button>
                        )}
                      </div>

                      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                        <input type="number" value={inputAmt} onChange={e => setInputAmt(e.target.value)}
                          placeholder="0.00"
                          style={{
                            flex: 1, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: 10, padding: "10px 14px", fontSize: 16, color: "#fff",
                            outline: "none", fontFamily: "inherit",
                          }} />
                        <button
                          onClick={() => mode === "deposit" ? handleDeposit(vault) : handleWithdraw(vault)}
                          disabled={busy || !inputAmt}
                          style={{
                            background: busy || !inputAmt ? "rgba(255,255,255,0.08)" : `linear-gradient(135deg,${vault.color},${vault.color}bb)`,
                            color: ["#FFD700","#EAB308","#22C55E","#86EFAC"].includes(vault.color) ? "#1B4332" : "#fff",
                            fontWeight: 800, fontSize: 13, padding: "10px 20px",
                            borderRadius: 10, border: "none",
                            cursor: busy || !inputAmt ? "not-allowed" : "pointer",
                            opacity: busy || !inputAmt ? 0.6 : 1,
                          }}>
                          {busy ? "..." : mode === "deposit" ? "Deposit" : "Redeem"}
                        </button>
                      </div>

                      {mode === "deposit" && (
                        <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
                          <Shield size={10} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
                          Approve + deposit in two transactions · both on Sepolia Etherscan
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showModal && <WalletConnectModal onClose={() => setShowModal(false)} />}
    </main>
  );
}
