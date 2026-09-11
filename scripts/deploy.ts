/**
 * deploy.ts — deploy NuvariToken + ConservationNFT to Sepolia (or any network).
 *
 * Usage:
 *   npx hardhat run scripts/deploy.ts --network sepolia
 *   npx hardhat run scripts/deploy.ts --network localhost
 *
 * Reads from .env:
 *   PRIVATE_KEY   deployer private key (64-char hex, with or without 0x)
 *   SEPOLIA_RPC_URL       Sepolia RPC endpoint (defaults to public Sepolia RPC)
 *   WALLET_ADDRESS     optional — printed in output for reference
 *
 * Writes deployments.json at project root on success.
 */

import { writeFile } from "node:fs/promises";
import { network } from "hardhat";
import { parseEther, formatEther } from "viem";

const deploymentsPath = new URL("../deployments.json", import.meta.url);

// ── Bootstrap the viem clients from hardhat ───────────────────────────────
const { viem } = await network.create();
const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();

const networkName: string = publicClient.chain?.name ?? network.name;
const chainId: number = publicClient.chain?.id ?? 0;

console.log("─────────────────────────────────────────");
console.log(`Network  : ${networkName} (chainId ${chainId})`);
console.log(`Deployer : ${deployer.account.address}`);

// ── Guard: require gas balance on live networks ───────────────────────────
const balance = await publicClient.getBalance({ address: deployer.account.address });
console.log(`Balance  : ${formatEther(balance)} ETH`);

if (network.name === "sepolia" && balance === 0n) {
  throw new Error(
    "Deployer wallet has 0 ETH on Sepolia. Fund it at https://sepoliafaucet.com before deploying.",
  );
}
console.log("─────────────────────────────────────────");

// ── 1. Deploy NuvariToken ─────────────────────────────────────────────────
console.log("\n[1/2] Deploying NuvariToken…");
const nuvariToken = await viem.deployContract("NuvariToken", [
  "Nuvari Token",   // name
  "NVR",            // symbol
  parseEther("50000000"),  // cap   — 50 M NVR
  parseEther("50000000"),  // initial supply minted to deployer
]);
console.log(`  ✓ NuvariToken  : ${nuvariToken.address}`);
console.log(`    Explorer     : https://sepolia.etherscan.io/address/${nuvariToken.address}`);

// ── 2. Deploy ConservationNFT ─────────────────────────────────────────────
console.log("\n[2/2] Deploying ConservationNFT…");
const conservationNFT = await viem.deployContract("ConservationNFT", [
  "KAI Conservation NFT",  // name
  "KNFT",                  // symbol
  parseEther("0.001"),     // mintPrice — 0.001 ETH per mint
  BigInt(105),             // maxSupply — 105 conservation NFTs
]);
console.log(`  ✓ ConservationNFT : ${conservationNFT.address}`);
console.log(`    Explorer        : https://sepolia.etherscan.io/address/${conservationNFT.address}`);
console.log(`    Mint price      : 0.001 ETH`);
console.log(`    Max supply      : 105`);

// ── Write deployments.json ────────────────────────────────────────────────
const isTestnet = network.name === "sepolia";
const explorerBase = isTestnet
  ? "https://sepolia.etherscan.io"
  : "https://etherscan.io";

const deployment = {
  network: networkName,
  chainId,
  deployedAt: new Date().toISOString(),
  deployer: deployer.account.address,
  explorerBase,
  contracts: {
    nuvariToken: {
      address: nuvariToken.address,
      name: "NuvariToken",
      symbol: "NVR",
      decimals: 18,
      cap: "50000000",
      initialSupply: "50000000",
      explorer: `${explorerBase}/address/${nuvariToken.address}`,
    },
    conservationNFT: {
      address: conservationNFT.address,
      name: "ConservationNFT",
      symbol: "KNFT",
      mintPrice: "0.001",
      mintPriceWei: parseEther("0.001").toString(),
      maxSupply: 105,
      explorer: `${explorerBase}/address/${conservationNFT.address}`,
    },
  },
};

await writeFile(deploymentsPath, `${JSON.stringify(deployment, null, 2)}\n`);

console.log("\n─────────────────────────────────────────");
console.log("✓ deployments.json written.");
console.log("  Add the NVR address as a custom token in Web3 Wallet.");
console.log("  Run  npx hardhat run scripts/mint-nft.ts --network sepolia  to mint an NFT.");
console.log("─────────────────────────────────────────\n");
