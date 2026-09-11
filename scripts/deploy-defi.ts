/**
 * deploy-defi.ts — deploy KaiVault (×6 tokens) + KaiAMM factory + seed pools
 *
 * Usage:
 *   npx hardhat run scripts/deploy-defi.ts --network sepolia
 *   npx hardhat run scripts/deploy-defi.ts --network localhost
 *
 * Prerequisites:
 *   - .env must have PRIVATE_KEY and SEPOLIA_RPC_URL
 *   - frontend/src/lib/deployedAddresses.json must exist
 *     (i.e. deploy.ts already ran and minted the 6 ecosystem tokens)
 *
 * Writes:
 *   defi-addresses.json        (project root)
 *   frontend/src/lib/defiAddresses.json   (consumed by the frontend)
 */

import { writeFile, readFile } from "node:fs/promises";
import { existsSync }          from "node:fs";
import { resolve, dirname }    from "node:path";
import { fileURLToPath }       from "node:url";
import { network }             from "hardhat";
import { parseEther, formatEther } from "viem";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Load already-deployed token addresses ───────────────────────────────────
const tokenAddrFile = resolve(__dirname, "..", "frontend", "src", "lib", "deployedAddresses.json");
const tokenAddrPath = new URL("../frontend/src/lib/deployedAddresses.json", import.meta.url);

if (!existsSync(tokenAddrFile)) {
  throw new Error(
    "frontend/src/lib/deployedAddresses.json not found.\n" +
    "Run  npx hardhat run scripts/deploy.ts --network sepolia  first to deploy the ERC-20 tokens.",
  );
}

const tokenFile = JSON.parse(await readFile(tokenAddrPath, "utf8")) as {
  tokens: Record<string, string>;
};
const T = tokenFile.tokens; // { NVR, yBOB, YTOKEN, YGOLD, GAMI, CENTS }

// ─── Vault APY configuration (basis points) ──────────────────────────────────
const VAULT_CONFIG: Record<string, { apyBps: number }> = {
  NVR:    { apyBps: 1520 },  // 15.2%
  yBOB:   { apyBps:  750 },  //  7.5%
  YTOKEN: { apyBps: 1480 },  // 14.8%
  YGOLD:  { apyBps: 1240 },  // 12.4%
  GAMI:   { apyBps: 2200 },  // 22.0%
  CENTS:  { apyBps:  650 },  //  6.5%
};

// ─── Bootstrap viem clients ───────────────────────────────────────────────────
const { viem }     = await network.create();
const publicClient = await viem.getPublicClient();
const [deployer]   = await viem.getWalletClients();

const networkName = publicClient.chain?.name ?? network.name;
const chainId     = publicClient.chain?.id   ?? 0;
const explorer    = chainId === 11155111 ? "https://sepolia.etherscan.io" : "https://etherscan.io";

console.log("─────────────────────────────────────────");
console.log(`Network  : ${networkName} (chainId ${chainId})`);
console.log(`Deployer : ${deployer.account.address}`);

const balance = await publicClient.getBalance({ address: deployer.account.address });
console.log(`Balance  : ${formatEther(balance)} ETH`);

if (network.name === "sepolia" && balance < parseEther("0.2")) {
  throw new Error(
    `Low ETH balance (${formatEther(balance)}). ` +
    "You need at least 0.2 ETH to deploy 6 vaults + AMM + pools. " +
    "Top up at https://sepoliafaucet.com",
  );
}
console.log("─────────────────────────────────────────\n");

// ─── 1. Deploy KaiAMM factory ─────────────────────────────────────────────────
console.log("[1/8] Deploying KaiAMM factory…");
const amm = await viem.deployContract("KaiAMM", []);
console.log(`  ✓ KaiAMM : ${amm.address}`);
console.log(`    ${explorer}/address/${amm.address}`);

// ─── 2. Deploy one KaiVault per ecosystem token ───────────────────────────────
const vaults: Record<string, { address: string; apyBps: number }> = {};

const symbols = ["NVR", "yBOB", "YTOKEN", "YGOLD", "GAMI", "CENTS"] as const;
for (let i = 0; i < symbols.length; i++) {
  const sym = symbols[i];
  const tokenAddr = T[sym];
  if (!tokenAddr) {
    console.warn(`  ⚠  ${sym} address not found in deployedAddresses.json — skipping vault`);
    continue;
  }
  const { apyBps } = VAULT_CONFIG[sym];

  console.log(`[${i + 2}/8] Deploying KaiVault for ${sym}…`);
  const vault = await viem.deployContract("KaiVault", [
    tokenAddr as `0x${string}`,
    `KAI ${sym} Vault`,
    `kv${sym}`,
    BigInt(apyBps),
  ]);
  vaults[sym] = { address: vault.address, apyBps };
  console.log(`  ✓ kv${sym} : ${vault.address}  (${(apyBps / 100).toFixed(1)}% APY)`);
  console.log(`    ${explorer}/address/${vault.address}`);
}

// ─── 3. Create AMM pools (NVR/yBOB and YTOKEN/YGOLD) ─────────────────────────
const poolsCreated: { pairName: string; address: string; tokenA: string; tokenB: string }[] = [];

async function createPool(nameA: string, nameB: string) {
  const addrA = T[nameA];
  const addrB = T[nameB];
  if (!addrA || !addrB) {
    console.warn(`  ⚠  Skipping pool ${nameA}/${nameB} — token address missing`);
    return;
  }
  // Sort tokens canonically (smaller address first)
  const [t0, t1, n0, n1] = addrA.toLowerCase() < addrB.toLowerCase()
    ? [addrA, addrB, nameA, nameB]
    : [addrB, addrA, nameB, nameA];

  console.log(`[pool] Deploying ${nameA}/${nameB} pool…`);
  const pool = await viem.deployContract("KaiPool", [
    t0 as `0x${string}`,
    t1 as `0x${string}`,
    `KAI LP ${n0}/${n1}`,
    `kLP-${n0}-${n1}`,
  ]);
  console.log(`  ✓ Pool deployed : ${pool.address}`);

  // Register with AMM
  const regTx = await amm.write.registerPool([
    t0 as `0x${string}`,
    t1 as `0x${string}`,
    pool.address,
  ]);
  await publicClient.waitForTransactionReceipt({ hash: regTx });

  poolsCreated.push({ pairName: `${nameA}/${nameB}`, address: pool.address, tokenA: addrA, tokenB: addrB });
  console.log(`  ✓ Pool ${nameA}/${nameB} registered in AMM`);
  console.log(`    ${explorer}/address/${pool.address}`);
}

await createPool("NVR",    "yBOB");
await createPool("YTOKEN", "YGOLD");
await createPool("GAMI",   "CENTS");

// ─── 4. Write output files ────────────────────────────────────────────────────
const payload = {
  network:   networkName,
  chainId,
  deployedAt: new Date().toISOString(),
  deployer:   deployer.account.address,
  explorerBase: explorer,
  amm: {
    address: amm.address,
    explorer: `${explorer}/address/${amm.address}`,
  },
  vaults: Object.fromEntries(
    Object.entries(vaults).map(([sym, v]) => [
      sym,
      {
        address:  v.address,
        apyBps:   v.apyBps,
        apyPct:   `${(v.apyBps / 100).toFixed(1)}%`,
        asset:    T[sym],
        explorer: `${explorer}/address/${v.address}`,
      },
    ]),
  ),
  pools: poolsCreated.map(p => ({
    pair:     p.pairName,
    address:  p.address,
    tokenA:   p.tokenA,
    tokenB:   p.tokenB,
    explorer: `${explorer}/address/${p.address}`,
  })),
};

const rootPath     = resolve(__dirname, "..", "defi-addresses.json");
const frontendPath = resolve(__dirname, "..", "frontend", "src", "lib", "defiAddresses.json");

await writeFile(rootPath,     `${JSON.stringify(payload, null, 2)}\n`);
await writeFile(frontendPath, `${JSON.stringify(payload, null, 2)}\n`);

console.log("\n─────────────────────────────────────────");
console.log("✓ defi-addresses.json written (root + frontend/src/lib/)");
console.log(`  KaiAMM   : ${amm.address}`);
for (const [sym, v] of Object.entries(vaults)) {
  console.log(`  kv${sym.padEnd(6)} : ${v.address}`);
}
for (const p of poolsCreated) {
  console.log(`  Pool ${p.pairName.padEnd(12)} : ${p.address}`);
}
console.log("\nNext steps:");
console.log("  1. npx hardhat run scripts/deploy-defi.ts --network sepolia");
console.log("  2. Approve tokens + call deposit() via the Vaults page");
console.log("  3. Approve tokens + call addLiquidity() via the Pools page");
console.log("─────────────────────────────────────────\n");
