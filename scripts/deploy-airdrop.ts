/**
 * deploy-airdrop.ts — deploy the KAIAirdropVault
 *
 * Usage:
 *   npx hardhat run scripts/deploy-airdrop.ts --network sepolia
 *   npx hardhat run scripts/deploy-airdrop.ts --network localhost
 *
 * Prerequisites:
 *   - .env must have PRIVATE_KEY and SEPOLIA_RPC_URL
 *   - frontend/src/lib/deployedAddresses.json must exist
 *     (deploy.ts must have run so we know the NVR token address)
 *
 * Writes:
 *   airdrop-addresses.json                      (project root)
 *   frontend/src/lib/airdropAddresses.json (consumed by the frontend)
 */

import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { network } from "hardhat";
import { parseEther, formatEther } from "viem";

const __dirname = dirname(fileURLToPath(import.meta.url));

const tokenAddrFile = resolve(__dirname, "..", "frontend", "src", "lib", "deployedAddresses.json");
if (!existsSync(tokenAddrFile)) {
  throw new Error(
    "frontend/src/lib/deployedAddresses.json not found.\n" +
    "Run  npx hardhat run scripts/deploy.ts --network sepolia  first to deploy the ERC-20 tokens.",
  );
}

// ─── Bootstrap viem clients ───────────────────────────────────────────────────
const { viem } = await network.create();
const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();

const chainId = publicClient.chain?.id ?? 0;
const explorer = chainId === 11155111 ? "https://sepolia.etherscan.io" : "https://etherscan.io";

console.log("─────────────────────────────────────────");
console.log(`Deployer : ${deployer.account.address}`);
const balance = await publicClient.getBalance({ address: deployer.account.address });
console.log(`Balance  : ${formatEther(balance)} ETH`);
if (network.name === "sepolia" && balance < parseEther("0.1")) {
  throw new Error(`Low ETH balance (${formatEther(balance)}). Top up at https://sepoliafaucet.com`);
}
console.log("─────────────────────────────────────────\n");

// ─── Deploy KAIAirdropVault ───────────────────────────────────────────────────
// Root cooldown: 7 days (seconds) before a new allocation root can be set.
const ROOT_COOLDOWN = 7 * 24 * 60 * 60;

console.log("[1/1] Deploying KAIAirdropVault…");
const vault = await viem.deployContract("KAIAirdropVault", [
  "0x0000000000000000000000000000000000000000" as `0x${string}`, // token set via setToken() after KAI exists
  BigInt(ROOT_COOLDOWN),
]);
console.log(`  ✓ KAIAirdropVault : ${vault.address}`);
console.log(`    ${explorer}/address/${vault.address}`);

// ─── Write output files ───────────────────────────────────────────────────────
const payload = {
  network: publicClient.chain?.name ?? network.name,
  chainId,
  deployedAt: new Date().toISOString(),
  deployer: deployer.account.address,
  explorerBase: explorer,
  rootCooldownSeconds: ROOT_COOLDOWN,
  contract: {
    address: vault.address,
    explorer: `${explorer}/address/${vault.address}`,
  },
};

const rootPath = resolve(__dirname, "..", "airdrop-addresses.json");
const frontendPath = resolve(__dirname, "..", "frontend", "src", "lib", "airdropAddresses.json");

await writeFile(rootPath, JSON.stringify(payload, null, 2) + "\n");
await writeFile(frontendPath, JSON.stringify(payload, null, 2) + "\n");

console.log("\n─────────────────────────────────────────");
console.log("✓ airdrop-addresses.json written (root + frontend/src/lib/)");
console.log(`  KAIAirdropVault : ${vault.address}`);
console.log("\nNext steps:");
console.log("  1. When KAI exists, call setToken(KAI) on the vault (admin).");
console.log("  2. Compute a Merkle root from per-user allocations and call setMerkleRoot(root).");
console.log("  3. Users claim via the Airdrop page / claim() with their Merkle proof.");
console.log("─────────────────────────────────────────\n");
