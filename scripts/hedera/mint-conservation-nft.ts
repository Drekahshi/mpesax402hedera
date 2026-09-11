/**
 * scripts/hedera/mint-conservation-nft.ts
 * Phase 3 — Mint a Conservation NFT for a verified conservation event.
 *
 * Implements PRD Section 5.3 minting flow:
 *   Conservation event logged → Verification passes → Metadata packaged
 *   → TokenMintTransaction (with metadata pointer)
 *   → TransferTransaction (treasury → recipient)
 *   → HCS log entry (mint txId ↔ conservation record ID)
 *
 * Metadata design (PRD Section 5.2):
 *   On-chain:  metadata field = IPFS CID or URL string (small, pointer only)
 *   Off-chain: full JSON (photo, GPS, verifier, species, date) at the pointer
 *
 * Run:
 *   npx ts-node --esm scripts/hedera/mint-conservation-nft.ts \
 *     --to 0.0.xxxxxx \
 *     --metadata "ipfs://Qm..." \
 *     --conservation-id "cfa-event-2026-001" \
 *     --event-type "trees_planted" \
 *     --count 50
 *
 * Env vars required:
 *   HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY, HEDERA_CONNFT_TOKEN_ID,
 *   HEDERA_AUDIT_TOPIC_ID (optional — HCS log)
 */

import 'dotenv/config';
import {
  Client,
  AccountId,
  PrivateKey,
  TokenMintTransaction,
  TransferTransaction,
  TokenId,
  NftId,
  TopicMessageSubmitTransaction,
  TopicId,
  Hbar,
} from '@hashgraph/sdk';

// ── Config ────────────────────────────────────────────────────────────────────

const OPERATOR_ID  = process.env.HEDERA_OPERATOR_ID!;
const OPERATOR_KEY = process.env.HEDERA_OPERATOR_KEY!;
const NETWORK      = (process.env.HEDERA_NETWORK ?? 'testnet') as 'testnet' | 'mainnet';
const TOKEN_ID     = process.env.HEDERA_CONNFT_TOKEN_ID!;
const TOPIC_ID     = process.env.HEDERA_AUDIT_TOPIC_ID ?? '';

// ── Idempotency store (in-process; use a DB in production) ───────────────────
// Prevents double-minting if the script is retried for the same conservation event.
// In production: replace with a DB lookup on conservationId before minting.
const _mintedEvents = new Set<string>();

// ── Arg parsing ───────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const get  = (flag: string) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };

  const toAccount      = get('--to');
  const metadataPtr    = get('--metadata');
  const conservationId = get('--conservation-id');
  const eventType      = get('--event-type') ?? 'conservation_event';
  const countStr       = get('--count') ?? '1';

  if (!toAccount || !metadataPtr || !conservationId) {
    console.error(
      'Usage: mint-conservation-nft.ts --to <accountId> --metadata <ipfs://...> ' +
      '--conservation-id <id> [--event-type <string>] [--count <n>]',
    );
    process.exit(1);
  }

  const count = parseInt(countStr, 10);
  if (isNaN(count) || count < 1 || count > 10) {
    console.error('--count must be 1–10 (max 10 NFT serials per transaction)');
    process.exit(1);
  }

  return { toAccount, metadataPtr, conservationId, eventType, count };
}

// ── Client setup ──────────────────────────────────────────────────────────────

function buildClient(): Client {
  if (!OPERATOR_ID || !OPERATOR_KEY) {
    console.error('HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set');
    process.exit(1);
  }
  if (!TOKEN_ID) {
    console.error('HEDERA_CONNFT_TOKEN_ID must be set — run create-conservation-nft.ts first');
    process.exit(1);
  }
  const client = NETWORK === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(AccountId.fromString(OPERATOR_ID), PrivateKey.fromString(OPERATOR_KEY));
  return client;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { toAccount, metadataPtr, conservationId, eventType, count } = parseArgs();

  // Idempotency check
  if (_mintedEvents.has(conservationId)) {
    console.error(`Conservation event ${conservationId} already minted — aborting to prevent double-mint`);
    process.exit(1);
  }

  const client      = buildClient();
  const tokenId     = TokenId.fromString(TOKEN_ID);
  const operatorId  = AccountId.fromString(OPERATOR_ID);
  const recipientId = AccountId.fromString(toAccount);

  console.log(`\n🌿 Minting ${count} Conservation NFT(s) → ${toAccount}`);
  console.log(`   Conservation ID : ${conservationId}`);
  console.log(`   Event type      : ${eventType}`);
  console.log(`   Metadata ptr    : ${metadataPtr}`);

  // ── Step 1: Mint NFT serial(s) to treasury ────────────────────────────────
  // Each serial gets the same metadata pointer; off-chain record differentiates them.
  // HTS NFT metadata is bytes — encode the pointer as UTF-8.
  const metadataBytes = Buffer.from(metadataPtr, 'utf-8');
  const metadataList  = Array.from({ length: count }, () => metadataBytes);

  const mintTx = await new TokenMintTransaction()
    .setTokenId(tokenId)
    .setMetadata(metadataList)
    .setMaxTransactionFee(new Hbar(10))
    .execute(client);

  const mintReceipt = await mintTx.getReceipt(client);
  const serials     = mintReceipt.serials.map(s => s.toNumber());
  const mintTxId    = mintTx.transactionId.toString();

  console.log(`\n✅ NFT mint successful`);
  console.log(`   Serial(s) : ${serials.join(', ')}`);
  console.log(`   Mint Tx   : ${mintTxId}`);

  // ── Step 2: Transfer treasury → recipient ─────────────────────────────────
  let transferTx = new TransferTransaction().setMaxTransactionFee(new Hbar(10));
  for (const serial of serials) {
    const nftId = new NftId(tokenId, serial);
    transferTx = transferTx.addNftTransfer(nftId, operatorId, recipientId);
  }

  const transferResponse = await transferTx.execute(client);
  const transferReceipt  = await transferResponse.getReceipt(client);
  const transferTxId     = transferResponse.transactionId.toString();

  console.log(`\n✅ NFT transfer successful`);
  console.log(`   Transfer Tx : ${transferTxId}`);
  console.log(`   Status      : ${transferReceipt.status.toString()}`);

  // Mark as minted (idempotency)
  _mintedEvents.add(conservationId);

  // ── Step 3: HCS audit log (PRD Section 5.3) ───────────────────────────────
  // The HCS entry cross-references the mint txId with the conservation record ID
  // so the NFT and verification data are independently auditable.
  if (TOPIC_ID) {
    const logEntry = JSON.stringify({
      event:            'CONSERVATION_NFT_MINT',
      tokenId:          TOKEN_ID,
      serials,
      recipient:        toAccount,
      conservationId,   // ← links to off-chain Guardian/DB record
      eventType,
      metadataPointer:  metadataPtr,
      mintTxId,
      transferTxId,
      timestamp:        new Date().toISOString(),
      network:          NETWORK,
    });

    const hcsTx = await new TopicMessageSubmitTransaction()
      .setTopicId(TopicId.fromString(TOPIC_ID))
      .setMessage(logEntry)
      .setMaxTransactionFee(new Hbar(2))
      .execute(client);

    await hcsTx.getReceipt(client);
    console.log(`\n📋 HCS audit log written to topic ${TOPIC_ID}`);
    console.log(`   HCS Tx : ${hcsTx.transactionId.toString()}`);
    console.log(`   Links NFT serials [${serials}] ↔ conservation record "${conservationId}"`);
  } else {
    console.log('\n⚠️  HEDERA_AUDIT_TOPIC_ID not set — skipping HCS log');
    console.log('   Run create-hcs-topic.ts to create the audit topic first.');
  }

  console.log(`\n🔍 Explorer: https://hashscan.io/${NETWORK}/token/${TOKEN_ID}`);
  client.close();
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
