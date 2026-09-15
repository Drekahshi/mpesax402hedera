/**
 * scripts/hedera/deploy-all-hedera.ts
 *
 * Compiles and deploys all smart contracts to Hedera Testnet via Hashio JSON-RPC relay:
 *   - ConservationNFT
 *   - KaiAMM
 *   - KAIAirdropVault
 *   - KaiAgentRegistry
 *   - KaiEscrow
 *
 * Writes deployed addresses with https://hashscan.io/testnet/ links to:
 *   - deployments.json
 *   - defi-addresses.json
 *   - agent-infra.json
 *   - frontend/src/lib/deployedAddresses.json
 *   - frontend/src/lib/defiAddresses.json
 *   - frontend/src/lib/agentInfra.json
 *   - frontend/src/lib/airdropAddresses.json
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { createPublicClient, createWalletClient, http, parseEther, formatEther, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { defineChain } from 'viem';

// Define Hedera Testnet chain
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
  console.log('  KAI Smart Contract Deployment — Hedera Testnet');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  RPC       : ${rpcUrl}`);
  console.log(`  Deployer  : ${account.address}`);
  console.log(`  Chain ID  : 296`);

  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`  Balance   : ${formatEther(balance)} HBAR`);
  console.log('═══════════════════════════════════════════════════════\n');

  // Load contract artifacts compiled by Hardhat
  const artifactsDir = path.join(process.cwd(), 'artifacts', 'contracts');

  function loadArtifact(contractName: string) {
    const file = path.join(artifactsDir, `${contractName}.sol`, `${contractName}.json`);
    if (!fs.existsSync(file)) {
      throw new Error(`Artifact not found for ${contractName}. Run 'npx hardhat build' or compile first.`);
    }
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  // 1. Deploy ConservationNFT
  console.log('[1/5] Deploying ConservationNFT (KNFT)...');
  const nftArtifact = loadArtifact('ConservationNFT');
  const nftDeployTx = await walletClient.deployContract({
    abi: nftArtifact.abi,
    bytecode: nftArtifact.bytecode as `0x${string}`,
    args: [
      'KAI Conservation NFT',
      'KNFT',
      parseEther('0.001'),
      1000n,
    ],
  });
  const nftReceipt = await publicClient.waitForTransactionReceipt({ hash: nftDeployTx });
  const nftAddress = nftReceipt.contractAddress!;
  console.log(`  ✅ ConservationNFT : ${nftAddress}`);
  console.log(`     https://hashscan.io/testnet/contract/${nftAddress}`);

  // 2. Deploy KaiAMM
  console.log('\n[2/5] Deploying KaiAMM Factory...');
  const ammArtifact = loadArtifact('KaiAMM');
  const ammDeployTx = await walletClient.deployContract({
    abi: ammArtifact.abi,
    bytecode: ammArtifact.bytecode as `0x${string}`,
    args: [],
  });
  const ammReceipt = await publicClient.waitForTransactionReceipt({ hash: ammDeployTx });
  const ammAddress = ammReceipt.contractAddress!;
  console.log(`  ✅ KaiAMM : ${ammAddress}`);
  console.log(`     https://hashscan.io/testnet/contract/${ammAddress}`);

  // 3. Deploy KAIAirdropVault
  console.log('\n[3/5] Deploying KAIAirdropVault...');
  const airdropArtifact = loadArtifact('KAIAirdropVault');
  const airdropDeployTx = await walletClient.deployContract({
    abi: airdropArtifact.abi,
    bytecode: airdropArtifact.bytecode as `0x${string}`,
    args: [
      account.address, // Signer
      '0x00000000000000000000000000000000009f748c', // Hedera NVR token EVM address
    ],
  });
  const airdropReceipt = await publicClient.waitForTransactionReceipt({ hash: airdropDeployTx });
  const airdropAddress = airdropReceipt.contractAddress!;
  console.log(`  ✅ KAIAirdropVault : ${airdropAddress}`);
  console.log(`     https://hashscan.io/testnet/contract/${airdropAddress}`);

  // 4. Deploy KaiAgentRegistry
  console.log('\n[4/5] Deploying KaiAgentRegistry...');
  const registryArtifact = loadArtifact('KaiAgentRegistry');
  const registryDeployTx = await walletClient.deployContract({
    abi: registryArtifact.abi,
    bytecode: registryArtifact.bytecode as `0x${string}`,
    args: [],
  });
  const registryReceipt = await publicClient.waitForTransactionReceipt({ hash: registryDeployTx });
  const registryAddress = registryReceipt.contractAddress!;
  console.log(`  ✅ KaiAgentRegistry : ${registryAddress}`);
  console.log(`     https://hashscan.io/testnet/contract/${registryAddress}`);

  // 5. Deploy KaiEscrow
  console.log('\n[5/5] Deploying KaiEscrow...');
  const escrowArtifact = loadArtifact('KaiEscrow');
  const escrowDeployTx = await walletClient.deployContract({
    abi: escrowArtifact.abi,
    bytecode: escrowArtifact.bytecode as `0x${string}`,
    args: [registryAddress, account.address],
  });
  const escrowReceipt = await publicClient.waitForTransactionReceipt({ hash: escrowDeployTx });
  const escrowAddress = escrowReceipt.contractAddress!;
  console.log(`  ✅ KaiEscrow : ${escrowAddress}`);
  console.log(`     https://hashscan.io/testnet/contract/${escrowAddress}`);

  // Update configuration files
  console.log('\n>> Updating configuration JSON files...');

  const explorerBase = 'https://hashscan.io/testnet';

  const deploymentsPayload = {
    network: 'hederaTestnet',
    chainId: 296,
    deployedAt: new Date().toISOString(),
    deployer: account.address,
    explorerBase,
    contracts: {
      conservationNFT: {
        address: nftAddress,
        name: 'ConservationNFT',
        symbol: 'KNFT',
        mintPrice: '0.001',
        mintPriceWei: '1000000000000000',
        maxSupply: 1000,
        explorer: `${explorerBase}/contract/${nftAddress}`,
      },
      amm: {
        address: ammAddress,
        explorer: `${explorerBase}/contract/${ammAddress}`,
      },
      airdropVault: {
        address: airdropAddress,
        explorer: `${explorerBase}/contract/${airdropAddress}`,
      },
      agentRegistry: {
        address: registryAddress,
        explorer: `${explorerBase}/contract/${registryAddress}`,
      },
      escrow: {
        address: escrowAddress,
        explorer: `${explorerBase}/contract/${escrowAddress}`,
      },
    },
  };

  const defiPayload = {
    network: 'Hedera Testnet',
    chainId: 296,
    deployedAt: new Date().toISOString(),
    deployer: account.address,
    explorerBase,
    amm: {
      address: ammAddress,
      explorer: `${explorerBase}/contract/${ammAddress}`,
    },
    vaults: {},
    pools: [],
  };

  const agentInfraPayload = {
    network: 'Hedera Testnet',
    chainId: 296,
    deployedAt: new Date().toISOString(),
    deployer: account.address,
    explorerBase,
    contracts: {
      KaiAgentRegistry: {
        address: registryAddress,
        explorer: `${explorerBase}/contract/${registryAddress}`,
      },
      KaiEscrow: {
        address: escrowAddress,
        explorer: `${explorerBase}/contract/${escrowAddress}`,
      },
    },
  };

  const airdropPayload = {
    network: 'Hedera Testnet',
    chainId: 296,
    deployedAt: new Date().toISOString(),
    deployer: account.address,
    explorerBase,
    contract: {
      address: airdropAddress,
      name: 'KAIAirdropVault',
      explorer: `${explorerBase}/contract/${airdropAddress}`,
    },
  };

  fs.writeFileSync(path.join(process.cwd(), 'deployments.json'), JSON.stringify(deploymentsPayload, null, 2) + '\n');
  fs.writeFileSync(path.join(process.cwd(), 'defi-addresses.json'), JSON.stringify(defiPayload, null, 2) + '\n');
  fs.writeFileSync(path.join(process.cwd(), 'agent-infra.json'), JSON.stringify(agentInfraPayload, null, 2) + '\n');

  // Frontend copies
  fs.writeFileSync(path.join(process.cwd(), 'frontend', 'src', 'lib', 'deployedAddresses.json'), JSON.stringify(deploymentsPayload, null, 2) + '\n');
  fs.writeFileSync(path.join(process.cwd(), 'frontend', 'src', 'lib', 'defiAddresses.json'), JSON.stringify(defiPayload, null, 2) + '\n');
  fs.writeFileSync(path.join(process.cwd(), 'frontend', 'src', 'lib', 'agentInfra.json'), JSON.stringify(agentInfraPayload, null, 2) + '\n');
  fs.writeFileSync(path.join(process.cwd(), 'frontend', 'src', 'lib', 'airdropAddresses.json'), JSON.stringify(airdropPayload, null, 2) + '\n');

  console.log('  ✓ Updated all address JSON files with Hedera Testnet contract addresses');

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  Deployment to Hedera Testnet Complete!');
  console.log('═══════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('Deployment error:', err);
  process.exit(1);
});
