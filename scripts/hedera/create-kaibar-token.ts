/**
 * scripts/hedera/create-kaibar-token.ts
 * Phase 2 — KAIBAR HTS fungible token creation.
 *
 * Creates the KAIBAR token on Hedera Token Service and logs the token ID to
 * stdout so you can paste it into your .env files.
 *
 * Run:
 *   npx ts-node --esm scripts/hedera/create-kaibar-token.ts
 *
 * Writes to console:
 *   HEDERA_KAIBAR_TOKEN_ID=0.0.xxxxxx
 *   NEXT_PUBLIC_KAIBAR_TOKEN_ID=0.0.xxxxxx
 *
 * Env vars required (root .env):
 *   HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY, HEDERA_NETWORK
 */

import 'dotenv/config';
import {
  Client,
  AccountId,
  PrivateKey,
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
  TokenMintTransaction,
  TransferTransaction,
  TokenAssociateTransaction,
  TokenId,
  Hbar,
  CustomFractionalFee,
  CustomFixedFee,
} from '@hashgraph/sdk';

// ── Config ────────────────────────────────────────────────────────────────────

const OPERATOR_ID  = process.env.HEDERA_OPERATOR_ID!;
const OPERATOR_KEY = process.env.HEDERA_OPERATOR_KEY!;
const NETWORK      = (process.env.HEDERA_NETWORK ?? 'testnet') as 'testnet' | 'mainnet';

if (!OPERATOR_ID || !OPERATOR_KEY) {
  console.error('ERROR: HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set in .env');
  process.exit(1);
}

// ── KAIBAR token parameters (PRD Section 4.1) ─────────────────────────────────
const TOKEN_NAME      = 'KAIBAR';
const TOKEN_SYMBOL    = 'KBAR';
const TOKEN_DECIMALS  = 6;        // standard for utility/reward token
const INITIAL_SUPPLY  = 0;        // mint-on-demand (INFINITE supply type)
const SUPPLY_TYPE     = TokenSupplyType.Infinite;

// ── Client setup ──────────────────────────────────────────────────────────────

function buildClient(): Client {
  const client = NETWORK === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(
    AccountId.fromString(OPERATOR_ID),
    PrivateKey.fromString(OPERATOR_KEY),
  );
  return client;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const client     = buildClient();
  const operatorId = AccountId.fromString(OPERATOR_ID);
  const supplyKey  = PrivateKey.fromString(OPERATOR_KEY); // operator holds supply key
  const adminKey   = PrivateKey.fromString(OPERATOR_KEY); // admin key retained for MVP flexibility

  console.log(`\n🚀 Creating KAIBAR (${TOKEN_SYMBOL}) on Hedera ${NETWORK}...`);
  console.log(`   Treasury / operator: ${OPERATOR_ID}`);

  // ── Step 1: Create the token ──────────────────────────────────────────────
  const createTx = await new TokenCreateTransaction()
    .setTokenName(TOKEN_NAME)
    .setTokenSymbol(TOKEN_SYMBOL)
    .setDecimals(TOKEN_DECIMALS)
    .setInitialSupply(INITIAL_SUPPLY)
    .setTokenType(TokenType.FungibleCommon)
    .setSupplyType(SUPPLY_TYPE)
    .setTreasuryAccountId(operatorId)
    .setSupplyKey(supplyKey.publicKey)   // needed to mint/burn
    .setAdminKey(adminKey.publicKey)     // retained for MVP; can be cleared after audit
    // No freeze/KYC/wipe keys for MVP (per PRD Section 4.1)
    .setTokenMemo('KAI Nuvari reward & utility token — Hedera native')
    .setMaxTransactionFee(new Hbar(30))
    .execute(client);

  const createReceipt = await createTx.getReceipt(client);
  const tokenId       = createReceipt.tokenId!;

  console.log(`\n✅ KAIBAR token created!`);
  console.log(`   Token ID : ${tokenId.toString()}`);
  console.log(`   Tx ID    : ${createTx.transactionId.toString()}`);
  console.log(`   Explorer : https://hashscan.io/${NETWORK}/token/${tokenId.toString()}`);

  // ── Step 2: Mint an initial distribution batch ────────────────────────────
  // Mint 1,000,000 KBAR to the treasury as a seed supply for airdrop/rewards.
  // Amount is in the token's smallest unit: 1 KBAR = 1_000_000 units (6 decimals).
  const SEED_AMOUNT = 1_000_000 * Math.pow(10, TOKEN_DECIMALS); // 1M KBAR

  const mintTx = await new TokenMintTransaction()
    .setTokenId(tokenId)
    .setAmount(SEED_AMOUNT)
    .setMaxTransactionFee(new Hbar(10))
    .execute(client);

  const mintReceipt = await mintTx.getReceipt(client);

  console.log(`\n💰 Minted ${(SEED_AMOUNT / Math.pow(10, TOKEN_DECIMALS)).toLocaleString()} KBAR to treasury`);
  console.log(`   Total supply: ${mintReceipt.totalSupply?.toString() ?? 'unknown'}`);
  console.log(`   Mint Tx ID  : ${mintTx.transactionId.toString()}`);

  // ── Output env vars ───────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────────────────');
  console.log('Add these to your .env and frontend/.env.local:');
  console.log('─────────────────────────────────────────────────────');
  console.log(`HEDERA_KAIBAR_TOKEN_ID=${tokenId.toString()}`);
  console.log(`NEXT_PUBLIC_KAIBAR_TOKEN_ID=${tokenId.toString()}`);
  console.log('─────────────────────────────────────────────────────\n');

  client.close();
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
