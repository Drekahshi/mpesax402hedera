/**
 * scripts/hedera/deploy-nft-collections.ts
 * Deploy KAI Nuvari NFT collections as native HTS NonFungibleUnique tokens.
 *
 * Collections deployed:
 *
 *   1. KAI Conservation NFT (KCNFT) — 0.0.10449914  [ALREADY EXISTS]
 *      One per verified conservation event (tree planted, patrol, CFA milestone).
 *      Mints 3 sample serials with metadata pointers.
 *
 *   2. KAI Agent Passport (KAIP)
 *      On-chain W3C DID credential for each registered KAI agent.
 *      Soulbound concept — one per agent identity.
 *      Mints 1 sample serial (tx_analyst agent).
 *
 *   3. KAI Membership NFT (KAIM)
 *      Proof-of-membership for Chama, CFA, SACCO, SME participants.
 *      Tiered: Bronze / Silver / Gold / Platinum.
 *      Mints 4 sample serials (one per tier).
 *
 * All collections:
 *   - Treasury = operator (0.0.5834216)
 *   - Supply key = operator
 *   - Admin key = operator
 *   - CustomRoyaltyFee 5% to treasury (for marketplace resales)
 *   - Fallback fixed fee 1 HBAR
 *
 * Run:
 *   npx tsx scripts/hedera/deploy-nft-collections.ts
 *
 * Env required: HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY, HEDERA_NETWORK
 */

import 'dotenv/config';
import {
  Client,
  AccountId,
  PrivateKey,
  TokenId,
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
  TokenMintTransaction,
  CustomRoyaltyFee,
  CustomFixedFee,
  NftId,
  TransferTransaction,
  Hbar,
} from '@hashgraph/sdk';
import * as fs from 'fs';

// ── Config ────────────────────────────────────────────────────────────────────

const OPERATOR_ID  = process.env.HEDERA_OPERATOR_ID!;
const OPERATOR_KEY = process.env.HEDERA_OPERATOR_KEY!;
const NETWORK      = (process.env.HEDERA_NETWORK ?? 'testnet') as 'testnet' | 'mainnet';
const EXPLORER     = `https://hashscan.io/${NETWORK}`;

if (!OPERATOR_ID || !OPERATOR_KEY) {
  console.error('ERROR: HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set');
  process.exit(1);
}

function buildClient(): Client {
  const client = NETWORK === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(AccountId.fromString(OPERATOR_ID), PrivateKey.fromString(OPERATOR_KEY));
  client.setRequestTimeout(30_000);
  return client;
}

// ── Royalty fee builder (same 5% for all collections) ────────────────────────

function buildRoyaltyFee(operatorId: AccountId): CustomRoyaltyFee {
  return new CustomRoyaltyFee()
    .setNumerator(5)
    .setDenominator(100)
    .setFallbackFee(
      new CustomFixedFee()
        .setHbarAmount(new Hbar(1))
        .setFeeCollectorAccountId(operatorId),
    )
    .setFeeCollectorAccountId(operatorId);
}

// ── Create one NFT collection ─────────────────────────────────────────────────

async function createNftCollection(
  client: Client,
  name: string,
  symbol: string,
  memo: string,
  maxSupply: number,
): Promise<string> {
  const operatorId = AccountId.fromString(OPERATOR_ID);
  const supplyKey  = PrivateKey.fromString(OPERATOR_KEY);
  const adminKey   = PrivateKey.fromString(OPERATOR_KEY);

  const tx = await new TokenCreateTransaction()
    .setTokenName(name)
    .setTokenSymbol(symbol)
    .setTokenType(TokenType.NonFungibleUnique)
    .setSupplyType(TokenSupplyType.Finite)
    .setMaxSupply(maxSupply)
    .setDecimals(0)
    .setInitialSupply(0)
    .setTreasuryAccountId(operatorId)
    .setSupplyKey(supplyKey.publicKey)
    .setAdminKey(adminKey.publicKey)
    .setCustomFees([buildRoyaltyFee(operatorId)])
    .setTokenMemo(memo)
    .setMaxTransactionFee(new Hbar(30))
    .execute(client);

  const receipt = await tx.getReceipt(client);
  return receipt.tokenId!.toString();
}

// ── Mint NFT serials with metadata ────────────────────────────────────────────

async function mintSerials(
  client: Client,
  tokenIdStr: string,
  metadataList: string[],
): Promise<number[]> {
  const tokenId  = TokenId.fromString(tokenIdStr);
  const metaBytes = metadataList.map(m => Buffer.from(m, 'utf-8'));

  const tx = await new TokenMintTransaction()
    .setTokenId(tokenId)
    .setMetadata(metaBytes)
    .setMaxTransactionFee(new Hbar(10))
    .execute(client);

  const receipt = await tx.getReceipt(client);
  return receipt.serials.map(s => s.toNumber());
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const client = buildClient();

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('  KAI Nuvari NFT Collection Deployment — Hedera HTS');
  console.log(`  Network  : ${NETWORK}`);
  console.log(`  Operator : ${OPERATOR_ID}`);
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const results: Record<string, {
    tokenId: string;
    name: string;
    symbol: string;
    serials: number[];
    envKey: string;
  }> = {};

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Conservation NFT — ALREADY DEPLOYED (0.0.10449914)
  //    Just mint 3 sample serials to show it works
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('── 1. Conservation NFT (KCNFT) — 0.0.10449914 ──');
  console.log('   Already deployed. Minting 3 sample serials...');

  const conservationMeta = [
    'ipfs://kai/conservation/trees-planted-kakamega-2026-001',
    'ipfs://kai/conservation/forest-patrol-mau-2026-001',
    'ipfs://kai/conservation/cfa-milestone-nandi-2026-q3',
  ];

  try {
    const serials = await mintSerials(client, '0.0.10449914', conservationMeta);
    console.log(`  ✅ Minted serials: ${serials.join(', ')}`);
    console.log(`     ${EXPLORER}/token/0.0.10449914`);
    results['KCNFT'] = {
      tokenId: '0.0.10449914',
      name:    'KAI Conservation NFT',
      symbol:  'KCNFT',
      serials,
      envKey:  'HEDERA_CONNFT_TOKEN_ID',
    };
  } catch (err: any) {
    console.error(`  ✗ Mint failed: ${err?.message}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. KAI Agent Passport NFT (KAIP) — already created as 0.0.10450239
  //    Just mint the 8 agent passport serials
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n── 2. KAI Agent Passport NFT (KAIP) — 0.0.10450239 ──');
  console.log('   Already created. Minting 8 agent passport serials...');

  try {

    // Mint one passport per KAI agent (8 agents)
    const agentMeta = [
      'ipfs://kai/agent/tx-analyst-passport-v1',
      'ipfs://kai/agent/portfolio-health-passport-v1',
      'ipfs://kai/agent/contract-auditor-passport-v1',
      'ipfs://kai/agent/dao-drafter-passport-v1',
      'ipfs://kai/agent/commodity-pricing-passport-v1',
      'ipfs://kai/agent/policy-recommender-passport-v1',
      'ipfs://kai/agent/code-gen-passport-v1',
      'ipfs://kai/agent/hedera-rails-passport-v1',
    ];

    const agentSerials = await mintSerials(client, '0.0.10450239', agentMeta);
    console.log(`  💳 Minted ${agentSerials.length} agent passports  serials: ${agentSerials.join(', ')}`);

    results['KAIP'] = {
      tokenId: '0.0.10450239',
      name:    'KAI Agent Passport',
      symbol:  'KAIP',
      serials: agentSerials,
      envKey:  'HEDERA_AGENT_PASSPORT_NFT_ID',
    };
  } catch (err: any) {
    console.error(`  ✗ Failed: ${err?.message}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. KAI Membership NFT (KAIM) — already created as 0.0.10450242
  //    Mint 4 tier sample serials
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n── 3. KAI Membership NFT (KAIM) — 0.0.10450242 ──');
  console.log('   Already created. Minting 4 tier serials (Bronze/Silver/Gold/Platinum)...');

  try {

    // Mint one of each tier as samples
    const memberMeta = [
      'ipfs://kai/membership/bronze-chama-saver-v1',
      'ipfs://kai/membership/silver-msme-owner-v1',
      'ipfs://kai/membership/gold-cfa-member-v1',
      'ipfs://kai/membership/platinum-dao-delegate-v1',
    ];

    const memberSerials = await mintSerials(client, '0.0.10450242', memberMeta);
    console.log(`  🎖️  Minted ${memberSerials.length} membership tiers  serials: ${memberSerials.join(', ')}`);
    console.log(`      Bronze=${memberSerials[0]}  Silver=${memberSerials[1]}  Gold=${memberSerials[2]}  Platinum=${memberSerials[3]}`);

    results['KAIM'] = {
      tokenId: '0.0.10450242',
      name:    'KAI Membership',
      symbol:  'KAIM',
      serials: memberSerials,
      envKey:  'HEDERA_MEMBERSHIP_NFT_ID',
    };
  } catch (err: any) {
    console.error(`  ✗ Failed: ${err?.message}`);
  }

  client.close();

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('  NFT DEPLOYMENT SUMMARY');
  console.log('╠══════════════════════════════════════════════════════════╣');
  for (const [sym, r] of Object.entries(results)) {
    console.log(`  ${sym.padEnd(6)}  ${r.tokenId.padEnd(18)}  ${r.serials.length} serials minted`);
    console.log(`         ${EXPLORER}/token/${r.tokenId}`);
  }
  console.log('╚══════════════════════════════════════════════════════════╝');

  // ── Env vars to add ───────────────────────────────────────────────────────
  const envLines = [
    '',
    '# ── KAI NFT Collections (Hedera HTS) ───────────────────────',
    `# Deployed ${new Date().toISOString()} on ${NETWORK}`,
    `HEDERA_CONNFT_TOKEN_ID=0.0.10449914`,
    `NEXT_PUBLIC_CONNFT_TOKEN_ID=0.0.10449914`,
  ];

  for (const r of Object.values(results)) {
    if (r.tokenId === '0.0.10449914') continue;
    envLines.push(`${r.envKey}=${r.tokenId}`);
    envLines.push(`NEXT_PUBLIC_${r.symbol}_NFT_TOKEN_ID=${r.tokenId}`);
  }

  console.log('\nAdd to .env and frontend/.env.local:\n');
  console.log('─'.repeat(60));
  console.log(envLines.join('\n'));
  console.log('─'.repeat(60));

  // Save JSON
  fs.writeFileSync('nft-collections.json', JSON.stringify({
    network: NETWORK,
    operator: OPERATOR_ID,
    deployedAt: new Date().toISOString(),
    collections: results,
  }, null, 2));
  console.log('\nSaved: nft-collections.json');
}

main().catch(err => {
  console.error('\nScript failed:', err?.message ?? err);
  process.exit(1);
});
