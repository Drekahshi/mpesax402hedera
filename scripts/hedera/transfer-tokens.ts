/**
 * scripts/hedera/transfer-tokens.ts
 *
 * Transfers 100,000 of each KAI ecosystem token + 10 HBAR
 * from the operator account (0.0.5834216) to 0.0.5883612.
 */

import 'dotenv/config';
import {
  Client,
  AccountId,
  PrivateKey,
  TransferTransaction,
  TokenId,
  Hbar,
} from '@hashgraph/sdk';

const OPERATOR_ID  = process.env.HEDERA_OPERATOR_ID!;
const OPERATOR_KEY = process.env.HEDERA_OPERATOR_KEY!;
const NETWORK      = (process.env.HEDERA_NETWORK ?? 'testnet') as 'testnet' | 'mainnet';
const RECIPIENT_ID = process.argv[2] || '0.0.5883612';

const TOKENS: Record<string, { id: string; decimals: number; amount: number }> = {
  NVR:    { id: process.env.HEDERA_NVR_TOKEN_ID    ?? '0.0.10450060', decimals: 8, amount: 100_000 },
  yBOB:   { id: process.env.HEDERA_YBOB_TOKEN_ID   ?? '0.0.10450061', decimals: 6, amount: 100_000 },
  YTOKEN: { id: process.env.HEDERA_YTOKEN_TOKEN_ID ?? '0.0.10450063', decimals: 8, amount: 100_000 },
  YGOLD:  { id: process.env.HEDERA_YGOLD_TOKEN_ID  ?? '0.0.10450065', decimals: 8, amount: 100_000 },
  GAMI:   { id: process.env.HEDERA_GAMI_TOKEN_ID   ?? '0.0.10450068', decimals: 8, amount: 100_000 },
  CENTS:  { id: process.env.HEDERA_CENTS_TOKEN_ID  ?? '0.0.10450070', decimals: 6, amount: 100_000 },
  KBAR:   { id: process.env.HEDERA_KAIBAR_TOKEN_ID ?? '0.0.10449901', decimals: 6, amount: 100_000 },
};

async function main() {
  if (!OPERATOR_ID || !OPERATOR_KEY) {
    console.error('ERROR: HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set in .env');
    process.exit(1);
  }

  console.log('=======================================================');
  console.log('  KAI Token Transfer to Recipient');
  console.log('=======================================================');
  console.log(`  Network   : ${NETWORK}`);
  console.log(`  Operator  : ${OPERATOR_ID}`);
  console.log(`  Recipient : ${RECIPIENT_ID}`);
  console.log(`  Amount    : 100,000 for each token`);
  console.log('=======================================================\n');

  const client = NETWORK === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
  const operatorId = AccountId.fromString(OPERATOR_ID);
  const operatorKey = PrivateKey.fromString(OPERATOR_KEY);
  const recipientId = AccountId.fromString(RECIPIENT_ID);

  client.setOperator(operatorId, operatorKey);

  // 1. Transfer 10 HBAR for gas
  console.log(`>> Transferring 10 HBAR to ${RECIPIENT_ID}...`);
  try {
    const hbarTx = await new TransferTransaction()
      .addHbarTransfer(operatorId, new Hbar(-10))
      .addHbarTransfer(recipientId, new Hbar(10))
      .setMaxTransactionFee(new Hbar(2))
      .execute(client);
    const receipt = await hbarTx.getReceipt(client);
    console.log(`  ✅ 10 HBAR transferred (Status: ${receipt.status.toString()})`);
  } catch (err: any) {
    console.warn(`  ⚠️ HBAR transfer notice: ${err?.message || err}`);
  }

  // 2. Transfer each token
  const results: Record<string, { status: string; txId?: string }> = {};

  for (const [sym, cfg] of Object.entries(TOKENS)) {
    console.log(`\n>> Transferring 100,000 ${sym} (${cfg.id})...`);
    const rawAmount = cfg.amount * Math.pow(10, cfg.decimals);
    const tokenId = TokenId.fromString(cfg.id);

    try {
      const tx = await new TransferTransaction()
        .addTokenTransfer(tokenId, operatorId, -rawAmount)
        .addTokenTransfer(tokenId, recipientId, rawAmount)
        .setMaxTransactionFee(new Hbar(5))
        .execute(client);

      const receipt = await tx.getReceipt(client);
      const txId = tx.transactionId.toString();
      console.log(`  ✅ Transferred 100,000 ${sym} to ${RECIPIENT_ID} (Tx: ${txId})`);
      results[sym] = { status: 'SUCCESS', txId };
    } catch (err: any) {
      console.error(`  ❌ Failed to transfer ${sym}:`, err?.message || err);
      results[sym] = { status: `FAILED: ${err?.message || err}` };
    }
  }

  client.close();

  console.log('\n=======================================================');
  console.log('  Transfer Summary');
  console.log('=======================================================');
  for (const [sym, r] of Object.entries(results)) {
    console.log(`  ${sym.padEnd(8)} ${r.status} ${r.txId ? `(Tx: ${r.txId})` : ''}`);
  }
  console.log('=======================================================\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
