/**
 * seed-liquidity.mjs
 * Seeds initial liquidity into all 3 KaiPool AMM pools on Sepolia / Hedera Testnet.
 *
 * Without liquidity the pools return 0 from getAmountOut() and swaps fail.
 * This script approves the KaiAMM router for each token pair, then calls
 * addLiquidity() to seed reserves so the swap quote works immediately.
 *
 * Seed amounts (conservative — enough to quote but not large value):
 *   NVR/yBOB    → 1 000 NVR   : 1 000 yBOB   (1:1 peg)
 *   YTOKEN/YGOLD→ 1 000 YTOKEN: 500 YGOLD    (2:1 price)
 *   GAMI/CENTS  → 5 000 GAMI  : 500 CENTS    (10:1 price)
 *
 * Usage:
 *   node scripts/seed-liquidity.mjs
 *
 * Reads .env for PRIVATE_KEY and SEPOLIA_RPC_URL.
 * Reads frontend/src/lib/defiAddresses.json for AMM address.
 * Reads frontend/src/lib/deployedAddresses.json for token addresses.
 */

import { ethers } from "ethers";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, "..");
dotenv.config({ path: resolve(ROOT, ".env") });

// ── RPC + wallet ──────────────────────────────────────────────────────────────
const RPC_URL = process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org";
let   PK      = (process.env.PRIVATE_KEY || "").trim().replace(/^["']|["']$/g, "");
if (PK && !PK.startsWith("0x")) PK = "0x" + PK;
if (!PK || PK.length !== 66) {
  console.error("❌ PRIVATE_KEY not set or invalid in .env");
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer   = new ethers.Wallet(PK, provider);
const EXPLORER = "https://sepolia.etherscan.io";

console.log("─────────────────────────────────────────────────");
console.log(`Seeder   : ${signer.address}`);
const balance = await provider.getBalance(signer.address);
console.log(`Balance  : ${ethers.formatEther(balance)} ETH`);
if (balance < ethers.parseEther("0.05")) {
  console.error("❌ Need at least 0.05 ETH for gas. Top up at https://sepoliafaucet.com");
  process.exit(1);
}
console.log("─────────────────────────────────────────────────\n");

// ── Load addresses ────────────────────────────────────────────────────────────
const defiFile  = resolve(ROOT, "frontend", "src", "lib", "defiAddresses.json");
const tokenFile = resolve(ROOT, "frontend", "src", "lib", "deployedAddresses.json");

if (!existsSync(defiFile) || !existsSync(tokenFile)) {
  console.error("❌ defiAddresses.json or deployedAddresses.json not found.");
  console.error("   Run node scripts/deploy-all-sepolia.mjs first.");
  process.exit(1);
}

const defi   = JSON.parse(readFileSync(defiFile,  "utf8"));
const tokens = JSON.parse(readFileSync(tokenFile, "utf8")).tokens;

const AMM_ADDR = defi.amm?.address;
if (!AMM_ADDR) { console.error("❌ AMM address missing in defiAddresses.json"); process.exit(1); }

// ── Minimal ABIs ──────────────────────────────────────────────────────────────
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

const AMM_ABI = [
  "function addLiquidity(address tokenA, address tokenB, uint256 amtA, uint256 amtB, uint256 minLP) returns (uint256)",
  "function getPool(address tokenA, address tokenB) view returns (address)",
];

const POOL_ABI = [
  "function reserveA() view returns (uint256)",
  "function reserveB() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
];

const amm = new ethers.Contract(AMM_ADDR, AMM_ABI, signer);

// ── Gas overrides ─────────────────────────────────────────────────────────────
const GAS = { gasLimit: 500_000, gasPrice: ethers.parseUnits("26", "gwei") };

// ── Helper: approve if needed ─────────────────────────────────────────────────
async function ensureApproval(tokenAddr, spender, amount, symbol) {
  const token = new ethers.Contract(tokenAddr, ERC20_ABI, signer);
  const allowance = await token.allowance(signer.address, spender);
  if (allowance >= amount) {
    console.log(`  ✓ ${symbol} already approved`);
    return;
  }
  process.stdout.write(`  Approving ${symbol}… `);
  const tx = await token.approve(spender, ethers.MaxUint256, GAS);
  await tx.wait();
  console.log("✓");
}

// ── Seed config ───────────────────────────────────────────────────────────────
const SEEDS = [
  {
    name:   "NVR/yBOB",
    symA:   "NVR",   addrA: tokens.NVR,
    symB:   "yBOB",  addrB: tokens.yBOB,
    amtA:   ethers.parseEther("1000"),   // 1 000 NVR
    amtB:   ethers.parseEther("1000"),   // 1 000 yBOB  (1:1)
  },
  {
    name:   "YTOKEN/YGOLD",
    symA:   "YTOKEN", addrA: tokens.YTOKEN,
    symB:   "YGOLD",  addrB: tokens.YGOLD,
    amtA:   ethers.parseEther("1000"),   // 1 000 YTOKEN
    amtB:   ethers.parseEther("500"),    //   500 YGOLD  (2:1)
  },
  {
    name:   "GAMI/CENTS",
    symA:   "GAMI",  addrA: tokens.GAMI,
    symB:   "CENTS", addrB: tokens.CENTS,
    amtA:   ethers.parseEther("5000"),   // 5 000 GAMI
    amtB:   ethers.parseEther("500"),    //   500 CENTS  (10:1)
  },
];

// ── Seed each pool ────────────────────────────────────────────────────────────
for (const seed of SEEDS) {
  console.log(`\n═══ Seeding ${seed.name} ═══`);

  // Check if pool already has liquidity
  const poolAddr = await amm.getPool(seed.addrA, seed.addrB);
  if (poolAddr === ethers.ZeroAddress) {
    console.log(`  ⚠️  Pool address is zero — pool may not be registered in AMM.`);
    continue;
  }

  const pool = new ethers.Contract(poolAddr, POOL_ABI, provider);
  const [rA, rB] = await Promise.all([pool.reserveA(), pool.reserveB()]);

  if (rA > 0n || rB > 0n) {
    console.log(`  ✓ Already seeded: reserveA=${ethers.formatEther(rA)} ${seed.symA}, reserveB=${ethers.formatEther(rB)} ${seed.symB}`);
    continue;
  }

  // Check wallet balances
  const tokenA = new ethers.Contract(seed.addrA, ERC20_ABI, provider);
  const tokenB = new ethers.Contract(seed.addrB, ERC20_ABI, provider);
  const [balA, balB] = await Promise.all([
    tokenA.balanceOf(signer.address),
    tokenB.balanceOf(signer.address),
  ]);

  console.log(`  Wallet: ${ethers.formatEther(balA)} ${seed.symA}, ${ethers.formatEther(balB)} ${seed.symB}`);

  if (balA < seed.amtA) {
    console.log(`  ⚠️  Insufficient ${seed.symA} (need ${ethers.formatEther(seed.amtA)}, have ${ethers.formatEther(balA)})`);
    console.log(`     Seeding with available balance instead…`);
    seed.amtA = balA > 0n ? balA / 2n : 0n; // use half of available
    seed.amtB = balA > 0n ? seed.amtA : 0n;
  }
  if (balB < seed.amtB) {
    console.log(`  ⚠️  Insufficient ${seed.symB} (need ${ethers.formatEther(seed.amtB)}, have ${ethers.formatEther(balB)})`);
    seed.amtB = balB > 0n ? balB / 2n : 0n;
  }
  if (seed.amtA === 0n || seed.amtB === 0n) {
    console.log(`  ⚠️  Skipping — zero amounts. Mint or acquire ${seed.symA} and ${seed.symB} tokens first.`);
    continue;
  }

  // Approve both tokens to AMM router
  await ensureApproval(seed.addrA, AMM_ADDR, seed.amtA, seed.symA);
  await ensureApproval(seed.addrB, AMM_ADDR, seed.amtB, seed.symB);

  // Add liquidity
  process.stdout.write(`  Adding ${ethers.formatEther(seed.amtA)} ${seed.symA} + ${ethers.formatEther(seed.amtB)} ${seed.symB}… `);
  try {
    const tx = await amm.addLiquidity(
      seed.addrA, seed.addrB,
      seed.amtA, seed.amtB,
      0n, // minLP = 0 for initial seed
      GAS,
    );
    const receipt = await tx.wait();
    console.log("✓");
    console.log(`  Tx: ${EXPLORER}/tx/${receipt.hash}`);

    // Verify reserves
    const [rAafter, rBafter] = await Promise.all([pool.reserveA(), pool.reserveB()]);
    console.log(`  Reserves: ${ethers.formatEther(rAafter)} ${seed.symA} | ${ethers.formatEther(rBafter)} ${seed.symB}`);
  } catch (e) {
    console.log(`❌ Failed: ${e.message?.slice(0, 120)}`);
  }
}

console.log("\n─────────────────────────────────────────────────");
console.log("✅ Liquidity seeding complete.");
console.log("   Swap quotes should now work in the Pools page.");
console.log("─────────────────────────────────────────────────\n");
