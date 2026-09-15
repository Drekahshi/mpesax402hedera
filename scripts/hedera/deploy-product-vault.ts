/**
 * scripts/hedera/deploy-product-vault.ts
 *
 * Deploys KaiProductVault to Hedera Testnet (Chain ID 296) via Hashio JSON-RPC relay.
 * Writes deployed address to deployments.json and frontend config files.
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { createPublicClient, createWalletClient, http, parseEther, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { defineChain } from 'viem';

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
  console.log('  Deploying KaiProductVault — Hedera Testnet (EVM)');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  RPC       : ${rpcUrl}`);
  console.log(`  Deployer  : ${account.address}`);
  console.log(`  Chain ID  : 296`);

  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`  Balance   : ${formatEther(balance)} HBAR`);
  console.log('═══════════════════════════════════════════════════════\n');

  // Load contract artifact
  const artifactsDir = path.join(process.cwd(), 'artifacts', 'contracts');
  const artifactPath = path.join(artifactsDir, 'KaiProductVault.sol', 'KaiProductVault.json');
  if (!fs.existsSync(artifactPath)) {
    throw new Error('KaiProductVault artifact not found. Run npx hardhat build first.');
  }
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

  // Fee: 0.001 HBAR = 10^15 wei
  const initialFee = parseEther('0.001');

  console.log('Deploying KaiProductVault with treasury:', account.address, 'and initial fee: 0.001 HBAR...');
  const deployTx = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode as `0x${string}`,
    args: [account.address, initialFee],
  });

  console.log(`  Tx submitted: ${deployTx}`);
  console.log('  Waiting for receipt...');
  const receipt = await publicClient.waitForTransactionReceipt({ hash: deployTx });
  const vaultAddress = receipt.contractAddress!;

  console.log(`\n  ✅ KaiProductVault Deployed: ${vaultAddress}`);
  console.log(`     Explorer: https://hashscan.io/testnet/contract/${vaultAddress}`);

  // Update deployments.json
  const deploymentsFile = path.join(process.cwd(), 'deployments.json');
  let deployments: any = {};
  if (fs.existsSync(deploymentsFile)) {
    deployments = JSON.parse(fs.readFileSync(deploymentsFile, 'utf8'));
  }
  if (!deployments.contracts) deployments.contracts = {};
  deployments.contracts.productVault = {
    address: vaultAddress,
    name: 'KaiProductVault',
    fee: '0.001',
    treasury: account.address,
    explorer: `https://hashscan.io/testnet/contract/${vaultAddress}`,
  };
  fs.writeFileSync(deploymentsFile, JSON.stringify(deployments, null, 2), 'utf8');
  console.log('  Updated deployments.json');

  // Update frontend files
  const frontendDeployedJson = path.join(process.cwd(), 'frontend', 'src', 'lib', 'deployedAddresses.json');
  let frontendAddresses: any = {};
  if (fs.existsSync(frontendDeployedJson)) {
    frontendAddresses = JSON.parse(fs.readFileSync(frontendDeployedJson, 'utf8'));
  }
  frontendAddresses.productVault = vaultAddress;
  fs.writeFileSync(frontendDeployedJson, JSON.stringify(frontendAddresses, null, 2), 'utf8');
  console.log('  Updated frontend/src/lib/deployedAddresses.json');

  console.log('\nDeployment finished successfully!');
}

main().catch(err => {
  console.error('Deployment error:', err);
  process.exit(1);
});
