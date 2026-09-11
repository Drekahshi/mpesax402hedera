/**
 * scripts/hedera/mint-kaibar.ts
 * Phase 2 — Mint KAIBAR and transfer to a recipient account.
 *
 * Implements the minting flow from PRD Section 4.2:
 *   Trigger → Policy check → TokenMintTransaction → TransferTransaction → HCS log
 *
 * Run:
 *   npx ts-node --esm scripts/hedera/mint-kaibar.ts \
 *     --to 0.0.xxxxxx \
 *     --amount 100 \
 *     --reason "conservation_milestone:trees_planted:50"
 *
 * Env vars required:
 *   HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY, HEDERA_KAIBAR_TOKEN_ID,
 *   HEDERA_AUDIT_TOPIC_ID (optional — logs to HCS if set)
 */

import 'dotenv/config';
import {
  Client,
  AccountId,
  PrivateKey,
  TokenMintTransaction,
  TransferTransaction,
  TokenId,
  TopicMessageSubmitTransaction,
  TopicId,
  Hbar,
} from '@hashgraph/sdk';

// ── Config ────────────────────────────────────────────────────────────────────

const OPERATOR_ID  = process.env.HEDERA_OPERATOR_ID!;
const OPERATOR_KEY = process.env.HEDERA_OPERATOR_KEY!;
const NETWORK      = (process.env.HEDERA_NETWORK ?? 'testnet') as 'testnet' | 'mainnet';
const TOKEN_ID     = process.env.HEDERA_KAIBAR_TOKEN_ID!;
const TOPIC_ID     = process.env.HEDERA_AUDIT_TOPIC_ID ?? '';
const DECIMALS     = 6;

// Per-transaction mint cap (policy gate — PRD Section 8)
const PER_TX_CAP   = 10_000;  // max KBAR per single mint call

// ── Arg parsing ───────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const get  = (flag: string) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };
  const toAccount = get('--to');
  const amountStr = get('--amount');
  const reason    = get('--reason') ?? 'manual_mint';

  if (!toAccount || !amountStr) {
    console.error('Usage: mint-kaibar.ts --to <accountId> --amount <kbar> [--reason <string>]');
    process.exit(1);
  }

  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) {
    console.error('--amount must be a positive number');
    process.exit(1);
  }
  if (amount > PER_TX_CAP) {
    console.error(`Per-tx cap exceeded: max ${PER_TX_CAP} KBAR per mint call`);
    process.exit(1);
  }

  return { toAccount, amount, reason };
}

// ── Client setup ──────────────────────────────────────────────────────────────

function buildClient(): Client {
  if (!OPERATOR_ID || !OPERATOR_KEY) {
    console.error('HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set');
    process.exit(1);
  }
  if (!TOKEN_ID) {
    console.error('HEDERA_KAIBAR_TOKEN_ID must be set — run create-kaibar-token.ts first');
    process.exit(1);
  }
  const client = NETWORK === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(AccountId.fromString(OPERATOR_ID), PrivateKey.fromString(OPERATOR_KEY));
  return client;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { toAccount, amount, reason } = parseArgs();
  const client      = buildClient();
  const tokenId     = TokenId.fromString(TOKEN_ID);
  const operatorId  = AccountId.fromString(OPERATOR_ID);
  const recipientId = AccountId.fromString(toAccount);

  // Amount in smallest token unit (6 decimals)
  const rawAmount = Math.round(amount * Math.pow(10, DECIMALS));

  console.log(`\n🏭 Minting ${amount.toLocaleString()} KBAR → ${toAccount}`);
  console.log(`   Reason : ${reason}`);
  console.log(`   Raw    : ${rawAmount} (6 decimals)`);

  // ── Step 1: Mint to treasury ──────────────────────────────────────────────
  const mintTx = await new TokenMintTransaction()
    .setTokenId(tokenId)
    .setAmount(rawAmount)
    .setMaxTransactionFee(new Hbar(5))
    .execute(client);

  const mintReceipt = await mintTx.getReceipt(client);
  const mintTxId    = mintTx.transactionId.toString();

  console.log(`\n✅ Mint successful`);
  console.log(`   Tx ID        : ${mintTxId}`);
  console.log(`   Total supply : ${mintReceipt.totalSupply?.toString()}`);

  // ── Step 2: Transfer treasury → recipient ─────────────────────────────────
  const transferTx = await new TransferTransaction()
    .addTokenTransfer(tokenId, operatorId,  -rawAmount)
    .addTokenTransfer(tokenId, recipientId,  rawAmount)
    .setMaxTransactionFee(new Hbar(5))
    .execute(client);

  const transferReceipt = await transferTx.getReceipt(client);
  const transferTxId    = transferTx.transactionId.toString();

  console.log(`\n✅ Transfer successful`);
  console.log(`   Tx ID  : ${transferTxId}`);
  console.log(`   Status : ${transferReceipt.status.toString()}`);

  // ── Step 3: HCS audit log ─────────────────────────────────────────────────
  if (TOPIC_ID) {
    const logEntry = JSON.stringify({
      event:        'KAIBAR_MINT_TRANSFER',
      tokenId:      TOKEN_ID,
      recipient:    toAccount,
      amount:       rawAmount,
      amountKbar:   amount,
      reason,
      mintTxId,
      transferTxId,
      timestamp:    new Date().toISOString(),
      network:      NETWORK,
    });

    const hcsTx = await new TopicMessageSubmitTransaction()
      .setTopicId(TopicId.fromString(TOPIC_ID))
      .setMessage(logEntry)
      .setMaxTransactionFee(new Hbar(2))
      .execute(client);

    await hcsTx.getReceipt(client);
    console.log(`\n📋 HCS audit log written to topic ${TOPIC_ID}`);
    console.log(`   HCS Tx : ${hcsTx.transactionId.toString()}`);
  } else {
    console.log('\n⚠️  HEDERA_AUDIT_TOPIC_ID not set — skipping HCS log');
  }

  console.log(`\n🔍 Explorer: https://hashscan.io/${NETWORK}/transaction/${transferTxId}`);
  client.close();
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
