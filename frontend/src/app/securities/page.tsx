"use client";

/**
 * Securities & Insurance page
 *
 * Every "Deposit" is a real Hedera HTS transfer via /api/hedera/securities/deposit.
 * Every "Withdraw" is a real Hedera HTS transfer via /api/hedera/securities/withdraw.
 * Transaction IDs link directly to HashScan.
 */

import { useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import {
  ArrowLeft, Shield, Lock, Unlock, TrendingUp, Bug, ExternalLink, RefreshCw,
} from "lucide-react";
import { useKaiStore } from "@/store/useKaiStore";
import { useEcosystemBalances } from "@/hooks/useEcosystemBalances";
import WalletConnectModal from "@/components/WalletConnectModal";
import HederaTxConfirmation from "@/components/HederaTxConfirmation";
import { ECOSYSTEM_TOKENS } from "@/lib/tokens";
import { HTS_TOKENS } from "@/lib/hederaTokens";

// ─── Small network fee per action on Hedera (~0.01 HBAR covers consensus fee) ───
const FEE_HBAR = "0.01";

// ─── HashScan base URL ────────────────────────────────────────────────────────
const HASHSCAN = 'https://hashscan.io/testnet/transaction';

// ─── Types ───────────────────────────────────────────────────────────────────
type SecurityStatus = "LOCKED" | "UNLOCKED" | "PENDING_DAO";

interface Product {
  id:             string;
  icon:           string;
  name:           string;
  desc:           string;
  apy:            string;
  color:          string;
  tokenSymbol:    string; // must match ECOSYSTEM_TOKENS symbol
  conditionLabel: string;
  features:       string[];
}

// ─── Map each product to one of the live deployed ERC-20 tokens ──────────────
const SECURITIES: Product[] = [
  {
    id: "trust",   icon: "", name: "KAI Trust",      desc: "Time-locked token trust for beneficiaries",
    apy: "15.2%",  color: "#FFD700", tokenSymbol: "NVR",
    conditionLabel: "Time-locked for 5 years",
    features: ["Time-lock smart contract", "Named beneficiary", "Automated release"],
  },
  {
    id: "pension",    icon: "", name: "KAI Pension",  desc: "Long-term retirement savings",
    apy: "12.8%",  color: "#A78BFA", tokenSymbol: "YTOKEN",
    conditionLabel: "Vested until age 60",
    features: ["Vesting schedule", "Monthly auto-deposit", "Compound yield"],
  },
  {
    id: "mmf",     icon: "", name: "Money Market Fund", desc: "Low-risk yBOB liquidity basket",
    apy: "7.5%",   color: "#22C55E", tokenSymbol: "yBOB",
    conditionLabel: "Instant Liquidity (No Lock)",
    features: ["Instant liquidity", "RWA-backed", "Daily yield"],
  },
  {
    id: "rwa",     icon: "", name: "RWA Tokenization", desc: "Tokenize land, property, or commodity",
    apy: "18.0%",  color: "#F97316", tokenSymbol: "YGOLD",
    conditionLabel: "Secondary Market Unlocked",
    features: ["Legal NFT wrapper", "On-chain verification", "Fractional trading"],
  },
];

const INSURANCE: Product[] = [
  {
    id: "crop",    icon: "", name: "Community Crop Insurance", desc: "Protect against climate/weather crop loss",
    apy: "8.5%",   color: "#EAB308", tokenSymbol: "YGOLD",
    conditionLabel: "Parametric Trigger: Drought / Flood",
    features: ["Parametric weather triggers", "Instant payouts", "Community pooled risk"],
  },
  {
    id: "forest",     icon: "", name: "Forest Asset Protection", desc: "Cover for tokenized forest hectares",
    apy: "10.2%",  color: "#22C55E", tokenSymbol: "GAMI",
    conditionLabel: "Satellite Verified Outbreak/Fire",
    features: ["Wildfire protection", "Illegal logging cover", "Satellite verified"],
  },
  {
    id: "medical",    icon: "", name: "Medical/Emergency Pool", desc: "Community health emergency coverage",
    apy: "5.0%",   color: "#EF4444", tokenSymbol: "CENTS",
    conditionLabel: "Requires Verified Medical Receipt",
    features: ["DAO approved claims", "Fast medical dispersal", "Subsidized premiums"],
  },
];

// ─── Community Forest & Indigenous Commodities ────────────────────────────────
const COMMUNITY: Product[] = [
  {
    id: "honey",    icon: "", name: "Forest Honey Reserve",
    desc: "Wild honey harvested from community-managed forests. Each unit represents 1 kg of certified raw honey.",
    apy: "14.0%", color: "#F59E0B", tokenSymbol: "GAMI",
    conditionLabel: "Harvest Verified · Seasonal Release",
    features: ["Community harvester registry", "Seasonal yield unlocks", "Forest stewardship rewards"],
  },
  {
    id: "beads",    icon: "", name: "Cultural Beadwork NFT",
    desc: "Maasai, Ndebele & Turkana beadwork tokenized as fractional cultural NFTs. Artisans earn royalties on every trade.",
    apy: "11.5%", color: "#10b981", tokenSymbol: "NVR",
    conditionLabel: "Artisan Verified · DAO Curated",
    features: ["Artisan royalty on-chain", "Cultural IP protection", "Collector marketplace"],
  },
  {
    id: "necklace",    icon: "", name: "Heritage Necklace Vault",
    desc: "Traditional necklaces and ceremonial jewellery tokenized. Protects artisan income and preserves cultural heritage.",
    apy: "9.8%", color: "#A78BFA", tokenSymbol: "YTOKEN",
    conditionLabel: "Artisan Certified · Secondary Market",
    features: ["Provenance on-chain", "Fractional ownership", "Heritage fund contribution"],
  },
  {
    id: "milk",    icon: "", name: "Pastoral Milk Pool",
    desc: "Camel, cow & goat milk from pastoral communities tokenized for DeFi yield. Supports smallholder dairy farmers.",
    apy: "7.2%", color: "#60A5FA", tokenSymbol: "yBOB",
    conditionLabel: "Daily Collection Verified · Co-op Pooled",
    features: ["Cooperative milk pooling", "Real-time price oracle", "Farmer direct payments"],
  },
  {
    id: "medicine",    icon: "", name: "Traditional Medicine Registry",
    desc: "Indigenous medicinal plants and herbal formulations registered on-chain. Healers retain IP and royalties.",
    apy: "16.0%", color: "#34D399", tokenSymbol: "GAMI",
    conditionLabel: "Healer Council Approved · Rare Unlock",
    features: ["Healer IP protection", "Ethnobotanical registry", "Rare-plant conservation fund"],
  },
  {
    id: "recipe",    icon: "", name: "Community Recipe IP Vault",
    desc: "Traditional food recipes, fermentation methods, and seed-saving techniques stored immutably on-chain.",
    apy: "8.0%", color: "#F97316", tokenSymbol: "CENTS",
    conditionLabel: "Community Council Ratified",
    features: ["Immutable recipe registry", "Licensing fee distribution", "Seed sovereignty protection"],
  },
  {
    id: "charcoal",    icon: "", name: "Sustainable Charcoal Credits",
    desc: "Community woodlots producing certified sustainable charcoal. Carbon credits generated on each verified batch.",
    apy: "12.3%", color: "#78716C", tokenSymbol: "YGOLD",
    conditionLabel: "Carbon Audit Verified",
    features: ["Carbon credit stacking", "Woodlot stewardship", "Clean-cooking impact"],
  },
  {
    id: "weaving",    icon: "", name: "Textile & Weaving Co-op",
    desc: "Kikoy, kente, kanga and basket weaving pooled into a community textile fund. Weavers earn advance yield on future sales.",
    apy: "10.5%", color: "#EC4899", tokenSymbol: "YTOKEN",
    conditionLabel: "Co-op Verified · Market Linked",
    features: ["Weaver advance payments", "Export market linkage", "Cultural textile archive"],
  },
  {
    id: "seeds",    icon: "", name: "Heritage Seed Bank",
    desc: "Indigenous crop varieties preserved and tokenized. Communities stake tokens to fund seed multiplication.",
    apy: "6.5%", color: "#86EFAC", tokenSymbol: "NVR",
    conditionLabel: "Germination Verified · Season Unlock",
    features: ["Biodiversity preservation", "Seed sovereignty", "Community food security"],
  },
  {
    id: "water",    icon: "", name: "Community Water Rights",
    desc: "Tokenized water source rights for pastoral and farming communities. Collateral for dry-season credit access.",
    apy: "5.8%", color: "#38BDF8", tokenSymbol: "yBOB",
    conditionLabel: "Water Table Sensor Verified",
    features: ["Water rights registry", "Dry-season credit line", "IoT sensor integration"],
  },
  {
    id: "pottery",    icon: "", name: "Artisan Pottery & Ceramics",
    desc: "Hand-crafted community pottery registered as cultural RWAs. Each piece minted as NFT; proceeds fund pottery co-ops.",
    apy: "9.0%", color: "#FB923C", tokenSymbol: "CENTS",
    conditionLabel: "Artisan Guild Certified",
    features: ["Piece-level NFT minting", "Guild royalty split", "Tourism market access"],
  },
  {
    id: "bark",    icon: "", name: "Bark Cloth & Fibre Arts",
    desc: "Ugandan bark cloth (UNESCO heritage) and sisal fibre arts tokenized. Protects endangered craft traditions.",
    apy: "13.2%", color: "#92400E", tokenSymbol: "YGOLD",
    conditionLabel: "UNESCO Heritage Registry",
    features: ["UNESCO-linked registry", "Heritage preservation fund", "Artisan livelihood pool"],
  },
];

const ALL_PRODUCTS = [...SECURITIES, ...INSURANCE, ...COMMUNITY];

// ─── USD mock prices ──────────────────────────────────────────────────────────
const USD_PRICE: Record<string, number> = {
  NVR: 0.12, yBOB: 1.00, YTOKEN: 0.27, YGOLD: 2.01, GAMI: 0.56, CENTS: 0.09,
};

// ─── Clock icon (inline SVG) ──────────────────────────────────────────────────
function ClockIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SecuritiesPage() {
  const { address, isConnected } = useAccount();
  const hashpackAccountId        = useKaiStore(s => s.hashpackAccountId);
  const walletType               = useKaiStore(s => s.walletType);
  const storeBalances            = useKaiStore(s => s.balances);
  const isWalletConnected = isConnected || (walletType === 'hashpack' && Boolean(hashpackAccountId));
  const activeAddress     = walletType === 'hashpack' && hashpackAccountId ? hashpackAccountId : address;

  const { tokenBalances, holdings, loading: balancesLoading, refresh: refreshBalances } = useEcosystemBalances();

  const [showModal,    setShowModal]   = useState(false);
  const [activeTab,    setActiveTab]   = useState<"Products" | "Insurance" | "Community">("Products");
  const [activeItem,   setActiveItem]  = useState<string | null>(null);
  const [statusMsg,    setStatusMsg]   = useState("");
  const [txUrl,        setTxUrl]       = useState<string | null>(null);
  const [isLoading,    setIsLoading]   = useState(false);
  const [stakeAmt,     setStakeAmt]    = useState("");
  const [devMode,      setDevMode]     = useState(false);
  const [refreshing,   setRefreshing]  = useState(false);
  const [showTxConfirm, setShowTxConfirm] = useState(false);
  const [txConfirmData, setTxConfirmData] = useState<{
    success: boolean;
    transactionId?: string;
    explorerUrl?: string;
    evmTxHash?: string;
    evmExplorerUrl?: string;
    feePaid?: string;
    action: string;
    inputAmount?: string;
    errorReason?: string;
  } | null>(null);

  // Local on-chain deposit amounts per product (amounts the user has deposited this session)
  const [investments, setInvestments] = useState<Record<string, number>>({});
  const [conditions,  setConditions]  = useState<Record<string, SecurityStatus>>({
    // Securities
    trust: "LOCKED", pension: "LOCKED", mmf: "UNLOCKED", rwa: "UNLOCKED",
    // Insurance
    crop: "LOCKED",  forest: "LOCKED",  medical: "PENDING_DAO",
    // Community commodities
    honey: "UNLOCKED", beads: "UNLOCKED", necklace: "UNLOCKED", milk: "UNLOCKED",
    medicine: "PENDING_DAO", recipe: "LOCKED", charcoal: "UNLOCKED", weaving: "UNLOCKED",
    seeds: "LOCKED", water: "UNLOCKED", pottery: "UNLOCKED", bark: "PENDING_DAO",
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  const getToken = (sym: string) =>
    ECOSYSTEM_TOKENS.find(t => t.symbol === sym);

  const walletBalance = (sym: string): number => {
    if (tokenBalances[sym] !== undefined && tokenBalances[sym] > 0) return tokenBalances[sym];
    const key = sym.toLowerCase() as keyof typeof storeBalances;
    return (storeBalances && storeBalances[key]) ? Number(storeBalances[key]) : 0;
  };

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    await refreshBalances();
    setRefreshing(false);
  };

  // ── Deposit: real Hedera HTS transfer via server-side API ─────────────────
  const handleDeposit = async (product: Product) => {
    if (!isWalletConnected && !hashpackAccountId) { setShowModal(true); return; }

    const amt = parseFloat(stakeAmt);
    if (!amt || amt <= 0) { setStatusMsg("Enter an amount to deposit."); return; }

    const token = getToken(product.tokenSymbol);
    const tokenId = HTS_TOKENS[product.tokenSymbol as keyof typeof HTS_TOKENS];
    if (!tokenId) {
      setStatusMsg(`${product.tokenSymbol} is not yet deployed on Hedera.`);
      return;
    }

    const walletBal = walletBalance(product.tokenSymbol);
    if (walletBal > 0 && amt > walletBal) {
      setStatusMsg(`Insufficient ${product.tokenSymbol} balance (you have ${walletBal.toFixed(4)}).`);
      return;
    }

    setIsLoading(true);
    setStatusMsg(`Submitting ${product.tokenSymbol} deposit to Hedera...`);
    setTxUrl(null);

    try {
      const recipientAccount = hashpackAccountId ?? (typeof activeAddress === 'string' ? activeAddress : null);
      const isHederaAccount = recipientAccount && /^\d+\.\d+\.\d+$/.test(recipientAccount);

      const res = await fetch('/api/hedera/securities/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          tokenSymbol: product.tokenSymbol,
          amount: amt,
          recipientAccount: isHederaAccount ? recipientAccount : process.env.NEXT_PUBLIC_HEDERA_OPERATOR_ID ?? '0.0.5834216',
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        const txId: string = data.transactionId;
        const explorerUrl: string = data.explorerUrl ?? `${HASHSCAN}/${txId}`;
        const evmUrl: string = data.evmExplorerUrl ?? null;
        setTxUrl(explorerUrl);
        setStatusMsg(`✓ Deposited ${amt} ${product.tokenSymbol} (HTS + EVM Vault 0.001 HBAR fee to treasury)!`);
        setInvestments(prev => ({ ...prev, [product.id]: (prev[product.id] || 0) + amt }));
        setStakeAmt('');
        setTxConfirmData({
          success: true,
          transactionId: txId,
          explorerUrl,
          evmTxHash: data.evmTxHash,
          evmExplorerUrl: evmUrl,
          feePaid: data.contractFeePaid ?? '0.001 HBAR',
          action: `Deposit ${product.name}`,
          inputAmount: `${amt} ${product.tokenSymbol}`,
        });
        setShowTxConfirm(true);
        await refreshBalances();
      } else {
        throw new Error(data.error ?? 'Deposit failed');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transaction failed';
      setStatusMsg(msg.slice(0, 120));
      setTxConfirmData({ success: false, action: `Deposit ${product.name}`, errorReason: msg });
      setShowTxConfirm(true);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Withdraw: real Hedera HTS transfer treasury → user ─────────────────────
  const handleWithdraw = async (product: Product) => {
    if (!isWalletConnected && !hashpackAccountId) { setShowModal(true); return; }
    if (conditions[product.id] !== 'UNLOCKED') return;

    const invested = investments[product.id] || 0;
    if (invested <= 0) return;

    const tokenId = HTS_TOKENS[product.tokenSymbol as keyof typeof HTS_TOKENS];
    if (!tokenId) { setStatusMsg('Token not deployed on Hedera.'); return; }

    setIsLoading(true);
    setStatusMsg(`Initiating withdrawal of ${invested} ${product.tokenSymbol}...`);
    setTxUrl(null);

    try {
      const recipientAccount = hashpackAccountId ?? (typeof activeAddress === 'string' ? activeAddress : null);
      const isHederaAccount = recipientAccount && /^\d+\.\d+\.\d+$/.test(recipientAccount);

      const res = await fetch('/api/hedera/securities/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          tokenSymbol: product.tokenSymbol,
          amount: invested,
          recipientAccount: isHederaAccount ? recipientAccount : process.env.NEXT_PUBLIC_HEDERA_OPERATOR_ID ?? '0.0.5834216',
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        const txId: string = data.transactionId;
        const explorerUrl: string = data.explorerUrl ?? `${HASHSCAN}/${txId}`;
        const evmUrl: string = data.evmExplorerUrl ?? null;
        setTxUrl(explorerUrl);
        setStatusMsg(`✓ Withdrew ${invested} ${product.tokenSymbol} (HTS + EVM Vault confirmed)`);
        setInvestments(prev => ({ ...prev, [product.id]: 0 }));
        setTxConfirmData({
          success: true,
          transactionId: txId,
          explorerUrl,
          evmTxHash: data.evmTxHash,
          evmExplorerUrl: evmUrl,
          feePaid: data.contractFeePaid ?? '0.001 HBAR',
          action: `Withdraw from ${product.name}`,
          inputAmount: `${invested} ${product.tokenSymbol}`,
        });
        setShowTxConfirm(true);
        await refreshBalances();
      } else {
        throw new Error(data.error ?? 'Withdrawal failed');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transaction failed';
      setStatusMsg(msg.slice(0, 120));
      setTxConfirmData({ success: false, action: `Withdraw ${product.name}`, errorReason: msg });
      setShowTxConfirm(true);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleCondition = (id: string) => {
    const states: SecurityStatus[] = ["LOCKED", "UNLOCKED", "PENDING_DAO"];
    const idx  = states.indexOf(conditions[id]);
    setConditions(prev => ({ ...prev, [id]: states[(idx + 1) % states.length] }));
  };

  const currentList      = activeTab === "Products" ? SECURITIES : activeTab === "Insurance" ? INSURANCE : COMMUNITY;
  const portfolioTotalUsd = Object.entries(investments).reduce((sum, [id, amt]) => {
    const sym = ALL_PRODUCTS.find(p => p.id === id)?.tokenSymbol ?? "";
    return sum + amt * (USD_PRICE[sym] ?? 0);
  }, 0);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <main style={{ padding: "16px 16px 100px", display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Header */}
      <div style={{ paddingTop: 32, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/" style={{
            width: 36, height: 36, borderRadius: "50%",
            background: "rgba(232,65,66,0.1)", border: "1px solid rgba(232,65,66,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none",
          }}>
            <ArrowLeft size={18} color="#e84142" />
          </Link>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: "#fff", margin: 0 }}>Products</h1>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", margin: "3px 0 0" }}>
              Real Token deposits · EVM Smart Contract Vault · Hedera &amp; EVM
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleRefresh} style={{
            background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)",
            padding: 8, borderRadius: "50%", color: "rgba(255,255,255,0.6)", cursor: "pointer",
          }}>
            <RefreshCw size={15} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
          </button>
          <button onClick={() => setDevMode(!devMode)} style={{
            background: "rgba(255,255,255,0.07)", border: "none",
            padding: 8, borderRadius: "50%", color: "#FFD700", cursor: "pointer",
          }}>
            <Bug size={15} />
          </button>
        </div>
      </div>

      {/* Wallet banner */}
      {!isWalletConnected && (
        <button onClick={() => setShowModal(true)} style={{
          background: "rgba(232,65,66,0.08)", border: "1px dashed rgba(232,65,66,0.4)",
          borderRadius: 14, padding: "14px 16px", color: "#e84142", fontWeight: 700,
          fontSize: 13, cursor: "pointer", textAlign: "center",
        }}>
          Connect HashPack / MetaMask to deposit tokens
        </button>
      )}

      {/* Developer toggles */}
      {devMode && (
        <div style={{ background: "rgba(239,68,68,0.08)", border: "1px dashed #EF4444", padding: 12, borderRadius: 12 }}>
          <p style={{ fontSize: 11, color: "#FCA5A5", fontWeight: 700, margin: "0 0 8px" }}>CONDITION TOGGLES</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {Object.keys(conditions).map(k => (
              <button key={k} onClick={() => toggleCondition(k)} style={{
                background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.15)",
                color: "#fff", fontSize: 10, padding: "4px 10px", borderRadius: 6, cursor: "pointer",
              }}>
                {k.toUpperCase()}: <span style={{ color: conditions[k] === "UNLOCKED" ? "#22C55E" : "#F97316" }}>{conditions[k]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, background: "rgba(0,0,0,0.2)", padding: 4, borderRadius: 12 }}>
        {(["Products", "Insurance", "Community"] as const).map(tab => (
          <button key={tab}
            onClick={() => { setActiveTab(tab); setActiveItem(null); setStatusMsg(""); setTxUrl(null); }}
            style={{
              flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 12, fontWeight: 700,
              color:      activeTab === tab ? "#121212" : "#fff",
              background: activeTab === tab
                ? tab === "Community" ? "#34D399" : "#FFD700"
                : "transparent",
              border: "none", cursor: "pointer", transition: "all 0.2s",
            }}>
                    {tab === "Community" ? "Community" : tab}
          </button>
        ))}
      </div>

      {/* Portfolio strip */}
      <div className="glass" style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px", borderRadius: 16, border: "1px solid rgba(255,215,0,0.18)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ background: "rgba(255,215,0,0.1)", padding: 8, borderRadius: 10 }}>
            <TrendingUp size={16} color="#FFD700" />
          </div>
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", margin: 0 }}>MY PORTFOLIO</p>
            <p style={{ fontSize: 16, fontWeight: 900, color: "#fff", margin: 0 }}>${portfolioTotalUsd.toFixed(2)} USD</p>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", margin: 0 }}>Active Contracts</p>
          <p style={{ fontSize: 14, fontWeight: 800, color: "#22C55E", margin: 0 }}>
            {Object.values(investments).filter(v => v > 0).length}
          </p>
        </div>
      </div>

      {/* Product list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {currentList.map(product => {
          const isActive  = activeItem === product.id;
          const status    = conditions[product.id];
          const invested  = investments[product.id] || 0;
          const token     = getToken(product.tokenSymbol);
          const wBal      = walletBalance(product.tokenSymbol);
          const deployed  = true;

          return (
            <div key={product.id} className="glass" style={{
              borderRadius: 20, overflow: "hidden",
              border:     isActive ? `1px solid ${product.color}60` : "1px solid rgba(255,255,255,0.08)",
              background: isActive ? `${product.color}10` : "rgba(255,255,255,0.03)",
              transition: "all 0.2s ease",
            }}>

              {/* Header row */}
              <div
                onClick={() => { setActiveItem(isActive ? null : product.id); setStatusMsg(""); setTxUrl(null); }}
                style={{ padding: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 14, fontSize: 22,
                    background: `${product.color}20`, border: `1px solid ${product.color}40`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>{product.icon}</div>
                  <div>
                    <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", margin: "2px 0 0" }}>
                      {product.tokenSymbol} · <span style={{ color: "#22C55E" }}>✓ Live on Hedera (Hashio)</span>
                    </p>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  {invested > 0 ? (
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 900, color: "#fff", margin: 0 }}>{invested.toFixed(2)} {product.tokenSymbol}</p>
                      <p style={{ fontSize: 9, color: "#22C55E", margin: 0 }}>DEPOSITED</p>
                    </div>
                  ) : (
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 900, color: product.color, margin: 0 }}>{product.apy}</p>
                      <p style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", margin: 0 }}>APY</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Expanded panel */}
              {isActive && (
                <div style={{ padding: "0 16px 16px" }}>

                  {/* Live wallet balance */}
                  {isConnected && deployed && (
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: "8px 12px", marginBottom: 12,
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                        Wallet {product.tokenSymbol}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: product.color }}>
                        {wBal.toFixed(4)}
                      </span>
                    </div>
                  )}

                  {/* Contract address */}
                  {deployed && (
                    <div style={{ marginBottom: 12 }}>
                      <p style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.3)", margin: "0 0 4px", letterSpacing: 1 }}>
                        TOKEN CONTRACT
                      </p>
                      <a
                        href={`https://sepolia.etherscan.io/token/${token!.address}`}
                        target="_blank" rel="noopener noreferrer"
                        style={{
                          fontSize: 10, fontFamily: "monospace", color: "#60a5fa",
                          display: "flex", alignItems: "center", gap: 4, textDecoration: "none",
                        }}
                      >
                        {token!.address} <ExternalLink size={10} />
                      </a>
                    </div>
                  )}

                  {/* Condition badge */}
                  <div style={{
                    background: status === "UNLOCKED" ? "rgba(34,197,94,0.1)" : status === "LOCKED" ? "rgba(249,115,22,0.1)" : "rgba(234,179,8,0.1)",
                    border: `1px solid ${status === "UNLOCKED" ? "rgba(34,197,94,0.3)" : status === "LOCKED" ? "rgba(249,115,22,0.3)" : "rgba(234,179,8,0.3)"}`,
                    borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", gap: 8, marginBottom: 14,
                  }}>
                    {status === "UNLOCKED"
                      ? <Unlock size={15} color="#22C55E" />
                      : status === "LOCKED"
                        ? <Lock size={15} color="#F97316" />
                        : <ClockIcon size={15} color="#EAB308" />}
                    <div>
                      <p style={{
                        fontSize: 10, fontWeight: 800, margin: 0,
                        color: status === "UNLOCKED" ? "#22C55E" : status === "LOCKED" ? "#F97316" : "#EAB308",
                      }}>
                        {status === "UNLOCKED" ? "CONTRACT UNLOCKED & READY" : status === "LOCKED" ? "CONTRACT LOCKED" : "PENDING VERIFICATION"}
                      </p>
                      <p style={{ fontSize: 11, color: "#fff", margin: "2px 0 0" }}>{product.conditionLabel}</p>
                    </div>
                  </div>

                  {/* Status / tx message */}
                  {statusMsg && activeItem === product.id && (
                    <div style={{
                      background: "rgba(34,197,94,0.08)",
                      border:     "1px solid rgba(34,197,94,0.2)",
                      padding: "10px 12px", borderRadius: 10, fontSize: 11, color: "#fff", marginBottom: 12,
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

                  {invested > 0 ? (
                    /* ── WITHDRAW VIEW ── */
                    <div style={{ background: "rgba(0,0,0,0.25)", borderRadius: 12, padding: 16, border: "1px solid rgba(255,255,255,0.06)" }}>
                      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 700, margin: "0 0 6px" }}>DEPOSITED IN CONTRACT</p>
                      <p style={{ fontSize: 22, fontWeight: 900, color: "#fff", margin: "0 0 6px" }}>
                        {invested.toFixed(4)} {product.tokenSymbol}
                      </p>
                      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", margin: "0 0 16px" }}>
                        ≈ ${(invested * (USD_PRICE[product.tokenSymbol] ?? 0)).toFixed(2)} USD
                      </p>
                      <button
                        onClick={() => handleWithdraw(product)}
                        disabled={isLoading || status !== "UNLOCKED"}
                        style={{
                          width: "100%", padding: 12, borderRadius: 10, border: "none",
                          fontWeight: 800, fontSize: 13, cursor: (isLoading || status !== "UNLOCKED") ? "not-allowed" : "pointer",
                          background: status === "UNLOCKED"
                            ? `linear-gradient(135deg,${product.color},${product.color}bb)`
                            : "rgba(255,255,255,0.08)",
                          color: status === "UNLOCKED" && ["#FFD700", "#EAB308", "#22C55E"].includes(product.color)
                            ? "#121212" : status === "UNLOCKED" ? "#fff" : "rgba(255,255,255,0.3)",
                        }}>
                        {isLoading ? "Processing..." : status === "UNLOCKED" ? `Withdraw ${product.tokenSymbol}` : "Conditions Not Met"}
                      </button>
                      {status !== "UNLOCKED" && devMode && (
                        <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textAlign: "center", margin: "8px 0 0" }}>
                          Toggle condition in dev panel above ↑
                        </p>
                      )}
                    </div>
                  ) : (
                    /* ── DEPOSIT VIEW ── */
                    <div>
                      {!deployed ? (
                        <div style={{
                          background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.25)",
                          borderRadius: 10, padding: "12px 14px", fontSize: 11, color: "rgba(255,255,255,0.6)",
                        }}>
                          {product.tokenSymbol} is not yet deployed on Sepolia. Deploy via the Hardhat script first.
                        </div>
                      ) : (
                        <>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 1 }}>
                              DEPOSIT {product.tokenSymbol}
                            </span>
                            <button onClick={() => setStakeAmt(wBal.toFixed(4))} style={{
                              fontSize: 10, fontWeight: 700, color: product.color, background: "transparent",
                              border: "none", cursor: "pointer", padding: 0,
                            }}>
                              MAX {wBal.toFixed(4)}
                            </button>
                          </div>

                          {/* Fee notice */}
                          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", margin: "0 0 8px" }}>
                            <Shield size={10} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
                            0.001 HBAR vault fee sent to treasury + token transfer on Hedera
                          </p>

                          <div style={{ display: "flex", gap: 8 }}>
                            <input
                              value={stakeAmt}
                              onChange={e => setStakeAmt(e.target.value)}
                              type="number" placeholder="0.00"
                              style={{
                                flex: 1, background: "rgba(0,0,0,0.3)",
                                border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10,
                                padding: "10px 14px", fontSize: 14, color: "#fff",
                                outline: "none", fontFamily: "inherit",
                              }}
                            />
                            <button
                              onClick={() => handleDeposit(product)}
                              disabled={isLoading || !stakeAmt}
                              style={{
                                background: (isLoading || !stakeAmt)
                                  ? "rgba(255,255,255,0.08)"
                                  : `linear-gradient(135deg,${product.color},${product.color}bb)`,
                                color: ["#FFD700", "#EAB308", "#22C55E"].includes(product.color) ? "#1B4332" : "#fff",
                                fontWeight: 800, fontSize: 13, padding: "10px 20px",
                                borderRadius: 10, border: "none",
                                cursor: (isLoading || !stakeAmt) ? "not-allowed" : "pointer",
                                opacity: (isLoading || !stakeAmt) ? 0.6 : 1,
                              }}>
                              {isLoading ? "Processing" : "Deposit"}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showModal && <WalletConnectModal onClose={() => setShowModal(false)} />}

      {/* Hedera TX Confirmation Overlay */}
      {showTxConfirm && txConfirmData && (
        <HederaTxConfirmation
          success={txConfirmData.success}
          transactionId={txConfirmData.transactionId}
          explorerUrl={txConfirmData.explorerUrl}
          evmTxHash={txConfirmData.evmTxHash}
          evmExplorerUrl={txConfirmData.evmExplorerUrl}
          action={txConfirmData.action}
          inputAmount={txConfirmData.inputAmount}
          network="Hedera Testnet"
          errorReason={txConfirmData.errorReason}
          onClose={() => setShowTxConfirm(false)}
        />
      )}
    </main>
  );
}
