/**
 * mint-nft.ts — mint one ConservationNFT on Sepolia and pay the small network fee.
 *
 * Usage:
 *   npx hardhat run scripts/mint-nft.ts --network sepolia
 *
 * Optional env overrides (all fall back to sensible defaults):
 *   MINT_TO       recipient address  (defaults to deployer wallet)
 *   MINT_URI      IPFS / HTTP URI for the token metadata
 *                 (defaults to a placeholder; set a real IPFS CID for production)
 *
 * The contract address is read from deployments.json written by deploy.ts.
 * Re-run deploy.ts first if that file doesn't exist yet.
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { network } from "hardhat";
import { parseEther, formatEther, getAddress } from "viem";

// ── Load deployments.json ─────────────────────────────────────────────────
const deploymentsPath = new URL("../deployments.json", import.meta.url);

if (!existsSync(new URL("../deployments.json", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"))) {
  throw new Error(
    "deployments.json not found. Run  npx hardhat run scripts/deploy.ts --network sepolia  first.",
  );
}

const deployments = JSON.parse(
  await readFile(deploymentsPath, "utf8"),
) as {
  contracts: {
    conservationNFT: {
      address: `0x${string}`;
      mintPrice: string;
      maxSupply: number;
      explorer: string;
    };
  };
};

const nftAddress = getAddress(deployments.contracts.conservationNFT.address);
const mintPriceEther = deployments.contracts.conservationNFT.mintPrice; // e.g. "0.001"
const mintPrice = parseEther(mintPriceEther as `${number}`);

// ── Bootstrap viem clients ────────────────────────────────────────────────
const { viem } = await network.create();
const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();

const networkName: string = publicClient.chain?.name ?? network.name;
console.log("─────────────────────────────────────────");
console.log(`Network  : ${networkName}`);
console.log(`Minter   : ${deployer.account.address}`);

// ── Guard: enough ETH? ───────────────────────────────────────────────────
const balance = await publicClient.getBalance({ address: deployer.account.address });
console.log(`Balance  : ${formatEther(balance)} ETH`);

if (balance < mintPrice) {
  throw new Error(
    `Insufficient ETH. Need at least ${mintPriceEther} ETH to mint. ` +
    `Get testnet ETH at https://sepoliafaucet.com`,
  );
}

// ── Resolve recipient and URI ─────────────────────────────────────────────
const recipient = process.env.MINT_TO
  ? getAddress(process.env.MINT_TO)
  : deployer.account.address;

const tokenURI =
  process.env.MINT_URI ??
  "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"; // placeholder CID

console.log(`Recipient: ${recipient}`);
console.log(`Token URI: ${tokenURI}`);
console.log(`Mint fee : ${mintPriceEther} ETH`);
console.log(`Contract : ${nftAddress}`);
console.log("─────────────────────────────────────────");

// ── Load contract and call mint ───────────────────────────────────────────
const nft = await viem.getContractAt("ConservationNFT", nftAddress);

// Read current state before minting
const totalMinted = await nft.read.totalMinted() as bigint;
const maxSupply = await nft.read.maxSupply() as bigint;
console.log(`\nSupply   : ${totalMinted}/${maxSupply} minted`);

if (totalMinted >= maxSupply) {
  throw new Error("Collection is fully minted. No tokens remaining.");
}

console.log("\nSending mint transaction…");
const txHash = await nft.write.mint([recipient, tokenURI], { value: mintPrice });
console.log(`  Tx hash  : ${txHash}`);
console.log(`  Explorer : https://sepolia.etherscan.io/tx/${txHash}`);

// ── Wait for confirmation ─────────────────────────────────────────────────
console.log("  Waiting for confirmation…");
const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

if (receipt.status !== "success") {
  throw new Error(`Transaction reverted. Hash: ${txHash}`);
}

// The Minted event carries the tokenId
const mintedEvent = receipt.logs.find(log => log.address.toLowerCase() === nftAddress.toLowerCase());
const newTotal = await nft.read.totalMinted() as bigint;
const tokenId = newTotal - 1n;

console.log("\n─────────────────────────────────────────");
console.log(`✓ Minted token #${tokenId} to ${recipient}`);
console.log(`  Block    : ${receipt.blockNumber}`);
console.log(`  Gas used : ${receipt.gasUsed}`);
console.log(`  NFT      : https://sepolia.etherscan.io/token/${nftAddress}?a=${tokenId}`);
console.log(`  Supply   : ${newTotal}/${maxSupply} minted`);
console.log("─────────────────────────────────────────\n");
