/**
 * scripts/hedera/deploy-product-market.ts
 *
 * Deploys KaiProductMarket to Hedera Testnet (Chain ID 296) via Hashio JSON-RPC relay.
 * Registers catalog products and writes deployed address to deployments.json and frontend config files.
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { createPublicClient, createWalletClient, http, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const hederaTestnet = defineChain({
  id: 296,
  name: 'Hedera Testnet',
  nativeCurrency: { name: 'HBAR', symbol: 'HBAR', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://testnet.hashio.io/api'] },
  },
  blockExplorers: {
    default: { name: 'HashScan', url: 'https://hashscan.io/testnet' },
  },
});

const INITIAL_PRODUCTS = [
  { id: 'honey', name: 'Forest Honey Reserve', symbol: 'GAMI', price: 10n },
  { id: 'beads', name: 'Cultural Beadwork NFT', symbol: 'NVR', price: 50n },
  { id: 'necklace', name: 'Heritage Necklace Vault', symbol: 'YTOKEN', price: 25n },
  { id: 'milk', name: 'Pastoral Milk Pool', symbol: 'yBOB', price: 5n },
  { id: 'medicine', name: 'Traditional Medicine Registry', symbol: 'GAMI', price: 15n },
  { id: 'charcoal', name: 'Sustainable Charcoal Credits', symbol: 'YGOLD', price: 30n },
  { id: 'weaving', name: 'Textile & Weaving Co-op', symbol: 'YTOKEN', price: 40n },
  { id: 'seeds', name: 'Heritage Seed Bank', symbol: 'NVR', price: 10n },
  { id: 'water', name: 'Community Water Rights', symbol: 'yBOB', price: 8n },
  { id: 'pottery', name: 'Artisan Pottery & Ceramics', symbol: 'CENTS', price: 12n },
  { id: 'bark', name: 'Bark Cloth & Fibre Arts', symbol: 'YGOLD', price: 35n },
  { id: 'trust', name: 'KAI Trust', symbol: 'NVR', price: 100n },
  { id: 'pension', name: 'KAI Pension', symbol: 'YTOKEN', price: 100n },
  { id: 'mmf', name: 'Money Market Fund', symbol: 'yBOB', price: 100n },
  { id: 'rwa', name: 'RWA Tokenization', symbol: 'YGOLD', price: 100n },
  { id: 'crop', name: 'Community Crop Insurance', symbol: 'YGOLD', price: 50n },
  { id: 'forest', name: 'Forest Asset Protection', symbol: 'GAMI', price: 50n },
  { id: 'medical', name: 'Medical/Emergency Pool', symbol: 'CENTS', price: 20n },
];

async function main() {
  let pk = (process.env.PRIVATE_KEY || '').trim().replace(/^["']|["']$/g, '');
  if (!pk.startsWith('0x')) pk = '0x' + pk;
  if (pk.length !== 66) throw new Error('Invalid PRIVATE_KEY in .env');

  const account = privateKeyToAccount(pk as `0x${string}`);
  const rpcUrl = process.env.HEDERA_RPC_URL || 'https://testnet.hashio.io/api';

  const publicClient = createPublicClient({
    chain: hederaTestnet,
    transport: http(rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain: hederaTestnet,
    transport: http(rpcUrl),
  });

  console.log('═══════════════════════════════════════════════════════');
  console.log('  Deploying KaiProductMarket — Hedera Testnet (EVM)');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  RPC       : ${rpcUrl}`);
  console.log(`  Deployer  : ${account.address}`);
  console.log(`  Chain ID  : 296`);

  // Load contract artifact
  const artifactsDir = path.join(process.cwd(), 'artifacts', 'contracts');
  const artifactPath = path.join(artifactsDir, 'KaiProductMarket.sol', 'KaiProductMarket.json');
  if (!fs.existsSync(artifactPath)) {
    throw new Error('KaiProductMarket artifact not found. Run npx hardhat build first.');
  }
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

  // Initial protocol fee: 100,000 tinybars (0.001 HBAR on Hedera EVM)
  const initialFee = 100000n;

  console.log('\nDeploying KaiProductMarket...');
  const deployTx = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode as `0x${string}`,
    args: [account.address, initialFee],
  });

  console.log(`  Tx submitted: ${deployTx}`);
  console.log('  Waiting for receipt...');
  const receipt = await publicClient.waitForTransactionReceipt({ hash: deployTx });
  const marketAddress = receipt.contractAddress!;

  console.log(`\n  ✅ KaiProductMarket Deployed: ${marketAddress}`);
  console.log(`     Explorer: https://hashscan.io/testnet/contract/${marketAddress}`);

  // Register catalog products
  console.log('\nRegistering catalog products on-chain...');
  for (const p of INITIAL_PRODUCTS) {
    try {
      const regTx = await walletClient.writeContract({
        address: marketAddress,
        abi: artifact.abi,
        functionName: 'registerProduct',
        args: [p.id, p.name, p.symbol, p.price, account.address],
      });
      await publicClient.waitForTransactionReceipt({ hash: regTx });
      console.log(`  ✓ Registered: ${p.name} (${p.id})`);
    } catch (e: any) {
      console.warn(`  Notice registering ${p.id}:`, e?.message ?? e);
    }
  }

  // Update deployments.json
  const deploymentsFile = path.join(process.cwd(), 'deployments.json');
  let deployments: any = {};
  if (fs.existsSync(deploymentsFile)) {
    deployments = JSON.parse(fs.readFileSync(deploymentsFile, 'utf8'));
  }
  if (!deployments.contracts) deployments.contracts = {};
  deployments.contracts.productMarket = {
    address: marketAddress,
    name: 'KaiProductMarket',
    fee: '0.001',
    treasury: account.address,
    explorer: `https://hashscan.io/testnet/contract/${marketAddress}`,
  };
  fs.writeFileSync(deploymentsFile, JSON.stringify(deployments, null, 2), 'utf8');
  console.log('\n  Updated deployments.json');

  // Update frontend files
  const frontendDeployedJson = path.join(process.cwd(), 'frontend', 'src', 'lib', 'deployedAddresses.json');
  let frontendAddresses: any = {};
  if (fs.existsSync(frontendDeployedJson)) {
    frontendAddresses = JSON.parse(fs.readFileSync(frontendDeployedJson, 'utf8'));
  }
  if (!frontendAddresses.contracts) frontendAddresses.contracts = {};
  frontendAddresses.contracts.productMarket = {
    address: marketAddress,
    name: 'KaiProductMarket',
    fee: '0.001',
    treasury: account.address,
    explorer: `https://hashscan.io/testnet/contract/${marketAddress}`,
  };
  frontendAddresses.productMarket = marketAddress;
  fs.writeFileSync(frontendDeployedJson, JSON.stringify(frontendAddresses, null, 2), 'utf8');
  console.log('  Updated frontend/src/lib/deployedAddresses.json');

  console.log('\nAll done! KaiProductMarket is live on Hedera Testnet.');
}

main().catch(err => {
  console.error('Deployment error:', err);
  process.exit(1);
});
