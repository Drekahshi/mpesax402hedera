/**
 * scripts/hedera/create-conservation-nft.ts
 * Phase 3 — Conservation NFT HTS token creation.
 *
 * Creates a NonFungibleUnique HTS token for conservation events
 * (trees planted, forest patrols, CFA milestones, etc.).
 *
 * PRD Section 5.1:
 *   - TokenType.NonFungibleUnique
 *   - Supply key held by operator (not Needle)
 *   - CustomRoyaltyFee for future marketplace resales
 *   - Metadata pointer per serial (IPFS CID or URL)
 *
 * Run:
 *   npx ts-node --esm scripts/hedera/create-conservation-nft.ts
 *
 * Writes to console:
 *   HEDERA_CONNFT_TOKEN_ID=0.0.xxxxxx
 *   NEXT_PUBLIC_CONNFT_TOKEN_ID=0.0.xxxxxx
 */

import 'dotenv/config';
import {
  Client,
  AccountId,
  PrivateKey,
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
  CustomRoyaltyFee,
  CustomFixedFee,
  Hbar,
} from '@hashgraph/sdk';

// ── Config ────────────────────────────────────────────────────────────────────

const OPERATOR_ID  = process.env.HEDERA_OPERATOR_ID!;
const OPERATOR_KEY = process.env.HEDERA_OPERATOR_KEY!;
const NETWORK      = (process.env.HEDERA_NETWORK ?? 'testnet') as 'testnet' | 'mainnet';

if (!OPERATOR_ID || !OPERATOR_KEY) {
  console.error('ERROR: HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set in .env');
  process.exit(1);
}

// ── Conservation NFT parameters (PRD Section 5.1) ────────────────────────────
const TOKEN_NAME   = 'KAI Conservation NFT';
const TOKEN_SYMBOL = 'KCNFT';

// Royalty fee: 5% of resale value goes back to treasury (conservation fund).
// Uses CustomRoyaltyFee — correct for NFTs (NOT CustomFractionalFee which is fungible-only).
// Fallback fixed fee: 1 HBAR if no fungible value exchanged in the transfer.
const ROYALTY_NUMERATOR   = 5;    // 5%
const ROYALTY_DENOMINATOR = 100;
const ROYALTY_FALLBACK_HBAR = 1;

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
  const supplyKey  = PrivateKey.fromString(OPERATOR_KEY);
  const adminKey   = PrivateKey.fromString(OPERATOR_KEY);

  console.log(`\n🌳 Creating Conservation NFT (${TOKEN_SYMBOL}) on Hedera ${NETWORK}...`);
  console.log(`   Treasury / operator : ${OPERATOR_ID}`);
  console.log(`   Royalty fee         : ${ROYALTY_NUMERATOR}/${ROYALTY_DENOMINATOR} (${ROYALTY_NUMERATOR}%)`);
  console.log(`   Fallback fixed fee  : ${ROYALTY_FALLBACK_HBAR} HBAR`);

  // Royalty fee — collected by treasury on every secondary sale
  const royaltyFee = new CustomRoyaltyFee()
    .setNumerator(ROYALTY_NUMERATOR)
    .setDenominator(ROYALTY_DENOMINATOR)
    .setFallbackFee(
      new CustomFixedFee()
        .setHbarAmount(new Hbar(ROYALTY_FALLBACK_HBAR))
        .setFeeCollectorAccountId(operatorId),
    )
    .setFeeCollectorAccountId(operatorId);

  // ── Create the NFT token ──────────────────────────────────────────────────
  const createTx = await new TokenCreateTransaction()
    .setTokenName(TOKEN_NAME)
    .setTokenSymbol(TOKEN_SYMBOL)
    .setTokenType(TokenType.NonFungibleUnique)
    .setSupplyType(TokenSupplyType.Finite)
    .setMaxSupply(1_000_000)   // hard cap: 1M conservation events max
    .setDecimals(0)             // NFTs always have 0 decimals
    .setInitialSupply(0)        // mint on demand per conservation event
    .setTreasuryAccountId(operatorId)
    .setSupplyKey(supplyKey.publicKey)
    .setAdminKey(adminKey.publicKey)
    .setCustomFees([royaltyFee])
    .setTokenMemo('KAI Nuvari conservation event NFT — Hedera native')
    .setMaxTransactionFee(new Hbar(30))
    .execute(client);

  const createReceipt = await createTx.getReceipt(client);
  const tokenId       = createReceipt.tokenId!;

  console.log(`\n✅ Conservation NFT token created!`);
  console.log(`   Token ID : ${tokenId.toString()}`);
  console.log(`   Tx ID    : ${createTx.transactionId.toString()}`);
  console.log(`   Explorer : https://hashscan.io/${NETWORK}/token/${tokenId.toString()}`);

  // ── Output env vars ───────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────────────────');
  console.log('Add these to your .env and frontend/.env.local:');
  console.log('─────────────────────────────────────────────────────');
  console.log(`HEDERA_CONNFT_TOKEN_ID=${tokenId.toString()}`);
  console.log(`NEXT_PUBLIC_CONNFT_TOKEN_ID=${tokenId.toString()}`);
  console.log('─────────────────────────────────────────────────────\n');

  client.close();
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
