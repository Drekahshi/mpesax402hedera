/**
 * scripts/mint-kai-tokens.ts
 * Grant MINTER_ROLE to the deployer and mint 100,000 of each KAI token.
 *
 * Works on two networks:
 *   --network sepolia       — Ethereum Sepolia (standard EVM)
 *   --network hederaTestnet — Hedera testnet via JSON-RPC relay (hashio.io)
 *
 * Run:
 *   npx hardhat run scripts/mint-kai-tokens.ts --network hederaTestnet
 *   npx hardhat run scripts/mint-kai-tokens.ts --network sepolia
 *
 * Env vars required:
 *   PRIVATE_KEY      — 64-char hex key for the deployer wallet
 *                      (same address that deployed the contracts)
 *
 * The script:
 *   1. Connects to the deployer wallet
 *   2. Checks current balance of each token
 *   3. Grants DEFAULT_ADMIN_ROLE the MINTER_ROLE on any token that needs it
 *   4. Mints 100,000 tokens to the deployer (treasury)
 *   5. Confirms on-chain balances at the end
 */

import { viem } from 'hardhat';
import { parseUnits, formatUnits, type Address } from 'viem';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

// ── Token addresses (Sepolia — same EVM addresses work on Hedera relay too) ──
const TOKENS: Record<string, Address> = {
  NVR:    '0x6489Ea8302b00A8eEd4D82a78A5f9e71Fe2DaC62',
  yBOB:   '0xE4f6A3506616f7c8e445B20a5D93521bFeE97979',
  YTOKEN: '0xF550ACf387011BC0172F2a14656AcE65846b7fBC',
  YGOLD:  '0xEbA875e6cb6d19d8d31b3D29a2b2cE7457D5808A',
  GAMI:   '0x199fC58F7Ce929f1dBDA89b9EB2391582a321e7d',
  CENTS:  '0x1bd79052747A236Aca137380394da27771e95eeA',
};

const MINT_AMOUNT = parseUnits('100000', 18); // 100,000 with 18 decimals

// Minimal ABI — only the functions we need
const TOKEN_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs:  [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'totalSupply',
    type: 'function',
    stateMutability: 'view',
    inputs:  [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'mint',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs:  [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'grantRole',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs:  [{ name: 'role', type: 'bytes32' }, { name: 'account', type: 'address' }],
    outputs: [],
  },
  {
    name: 'hasRole',
    type: 'function',
    stateMutability: 'view',
    inputs:  [{ name: 'role', type: 'bytes32' }, { name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'DEFAULT_ADMIN_ROLE',
    type: 'function',
    stateMutability: 'view',
    inputs:  [],
    outputs: [{ name: '', type: 'bytes32' }],
  },
] as const;

// keccak256("MINTER_ROLE") — matches OpenZeppelin AccessControl
const MINTER_ROLE = '0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6' as const;

async function main() {
  const [walletClient] = await viem.getWalletClients();
  const publicClient   = await viem.getPublicClient();

  const deployer = walletClient.account.address;
  const chainId  = await publicClient.getChainId();

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  KAI Token Mint Script');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Network : chainId ${chainId}`);
  console.log(`  Deployer: ${deployer}`);
  console.log(`  Minting : 100,000 of each token`);
  console.log('═══════════════════════════════════════════════════════\n');

  const results: Record<string, { before: string; after: string; txHash: string }> = {};

  for (const [symbol, address] of Object.entries(TOKENS)) {
    console.log(`\n── ${symbol} (${address}) ──`);

    // ── Check current balance ─────────────────────────────────────────────
    const balanceBefore = await publicClient.readContract({
      address,
      abi: TOKEN_ABI,
      functionName: 'balanceOf',
      args: [deployer],
    });
    const supplyBefore = await publicClient.readContract({
      address,
      abi: TOKEN_ABI,
      functionName: 'totalSupply',
    });

    console.log(`   Balance before : ${formatUnits(balanceBefore, 18)} ${symbol}`);
    console.log(`   Total supply   : ${formatUnits(supplyBefore, 18)} ${symbol}`);

    if (balanceBefore >= MINT_AMOUNT) {
      console.log(`   ✓ Already has >= 100k. Skipping.`);
      results[symbol] = {
        before: formatUnits(balanceBefore, 18),
        after:  formatUnits(balanceBefore, 18),
        txHash: 'skipped',
      };
      continue;
    }

    // ── Grant MINTER_ROLE if not already held ─────────────────────────────
    const hasMinter = await publicClient.readContract({
      address,
      abi: TOKEN_ABI,
      functionName: 'hasRole',
      args: [MINTER_ROLE, deployer],
    });

    if (!hasMinter) {
      console.log(`   Granting MINTER_ROLE to deployer...`);
      const grantTxHash = await walletClient.writeContract({
        address,
        abi: TOKEN_ABI,
        functionName: 'grantRole',
        args: [MINTER_ROLE, deployer],
      });
      await publicClient.waitForTransactionReceipt({ hash: grantTxHash });
      console.log(`   ✓ MINTER_ROLE granted  tx: ${grantTxHash}`);
    } else {
      console.log(`   ✓ MINTER_ROLE already held`);
    }

    // ── Mint 100k to deployer ─────────────────────────────────────────────
    const amountToMint = MINT_AMOUNT - balanceBefore;
    console.log(`   Minting ${formatUnits(amountToMint, 18)} ${symbol} to ${deployer}...`);

    const mintTxHash = await walletClient.writeContract({
      address,
      abi: TOKEN_ABI,
      functionName: 'mint',
      args: [deployer, amountToMint],
    });
    await publicClient.waitForTransactionReceipt({ hash: mintTxHash });
    console.log(`   ✓ Minted  tx: ${mintTxHash}`);

    // ── Confirm new balance ───────────────────────────────────────────────
    const balanceAfter = await publicClient.readContract({
      address,
      abi: TOKEN_ABI,
      functionName: 'balanceOf',
      args: [deployer],
    });
    console.log(`   Balance after  : ${formatUnits(balanceAfter, 18)} ${symbol}`);

    results[symbol] = {
      before:  formatUnits(balanceBefore, 18),
      after:   formatUnits(balanceAfter, 18),
      txHash:  mintTxHash,
    };
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  Mint Summary');
  console.log('═══════════════════════════════════════════════════════');
  for (const [sym, r] of Object.entries(results)) {
    const status = r.txHash === 'skipped' ? '(already funded)' : `tx: ${r.txHash.slice(0, 12)}...`;
    console.log(`  ${sym.padEnd(7)} ${r.before.padStart(12)} → ${r.after.padStart(12)}  ${status}`);
  }

  // Write results to a JSON file for reference
  const outPath = path.join(process.cwd(), 'mint-results.json');
  fs.writeFileSync(outPath, JSON.stringify({ chainId, deployer, results, timestamp: new Date().toISOString() }, null, 2));
  console.log(`\n  Results saved to: mint-results.json`);
  console.log('═══════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('\nScript failed:', err?.message ?? err);
  process.exit(1);
});
