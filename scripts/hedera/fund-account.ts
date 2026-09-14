/**
 * scripts/hedera/fund-account.ts
 *
 * Transfers starter HBAR + KAI HTS tokens (NVR, yBOB, YTOKEN, YGOLD, GAMI, CENTS, KBAR)
 * from the operator account to any specified Hedera testnet account.
 *
 * Usage:
 *   npx tsx scripts/hedera/fund-account.ts 0.0.5834216
 *   npx tsx scripts/hedera/fund-account.ts 0.0.XXXXXXX
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

const OPERATOR_ID  = process.env.HEDERA_OPERATOR_ID;
const OPERATOR_KEY = process.env.HEDERA_OPERATOR_KEY;
const NETWORK      = (process.env.HEDERA_NETWORK ?? 'testnet') as 'testnet' | 'mainnet';

const HTS_TOKENS: Record<string, { id: string; decimals: number; amount: number }> = {
  NVR:    { id: process.env.HEDERA_NVR_TOKEN_ID    ?? '0.0.10450060', decimals: 8, amount: 5000 },
  yBOB:   { id: process.env.HEDERA_YBOB_TOKEN_ID   ?? '0.0.10450061', decimals: 6, amount: 5000 },
  YTOKEN: { id: process.env.HEDERA_YTOKEN_TOKEN_ID ?? '0.0.10450063', decimals: 8, amount: 2500 },
  YGOLD:  { id: process.env.HEDERA_YGOLD_TOKEN_ID  ?? '0.0.10450065', decimals: 8, amount: 1500 },
  GAMI:   { id: process.env.HEDERA_GAMI_TOKEN_ID   ?? '0.0.10450068', decimals: 8, amount: 8000 },
  CENTS:  { id: process.env.HEDERA_CENTS_TOKEN_ID  ?? '0.0.10450070', decimals: 6, amount: 10000 },
  KBAR:   { id: process.env.HEDERA_KAIBAR_TOKEN_ID ?? '0.0.10449901', decimals: 6, amount: 2000 },
};

async function main() {
  if (!OPERATOR_ID || !OPERATOR_KEY) {
    console.error('ERROR: HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set in .env');
    process.exit(1);
  }

  const targetAccountStr = process.argv[2] || OPERATOR_ID;
  console.log('=======================================================');
  console.log('  KAI Hedera Token Funding Script');
  console.log('=======================================================');
  console.log(`  Network   : ${NETWORK}`);
  console.log(`  Operator  : ${OPERATOR_ID}`);
  console.log(`  Recipient : ${targetAccountStr}`);
  console.log('=======================================================\n');

  const client = NETWORK === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
  const operatorId = AccountId.fromString(OPERATOR_ID);
  const operatorKey = PrivateKey.fromString(OPERATOR_KEY);
  const recipientId = AccountId.fromString(targetAccountStr);

  client.setOperator(operatorId, operatorKey);

  // 1. Transfer 10 HBAR if not self
  if (targetAccountStr !== OPERATOR_ID) {
    console.log('Transferring 10 HBAR...');
    try {
      const hbarTx = await new TransferTransaction()
        .addHbarTransfer(operatorId, new Hbar(-10))
        .addHbarTransfer(recipientId, new Hbar(10))
        .setMaxTransactionFee(new Hbar(2))
        .execute(client);
      const receipt = await hbarTx.getReceipt(client);
      console.log(`✓ 10 HBAR transferred! Status: ${receipt.status.toString()}`);
    } catch (err: any) {
      console.warn(`! HBAR transfer notice: ${err?.message || err}`);
    }
  }

  // 2. Transfer HTS tokens
  for (const [sym, cfg] of Object.entries(HTS_TOKENS)) {
    console.log(`\nProcessing ${sym} (${cfg.id})...`);
    const rawAmount = cfg.amount * Math.pow(10, cfg.decimals);
    const tokenId = TokenId.fromString(cfg.id);

    try {
      const tx = await new TransferTransaction()
        .addTokenTransfer(tokenId, operatorId, -rawAmount)
        .addTokenTransfer(tokenId, recipientId, rawAmount)
        .setMaxTransactionFee(new Hbar(5))
        .execute(client);

      const receipt = await tx.getReceipt(client);
      console.log(`✓ Sent ${cfg.amount.toLocaleString()} ${sym} (tx: ${tx.transactionId.toString()})`);
    } catch (err: any) {
      console.warn(`✗ ${sym} transfer note: ${err?.message || err}`);
      console.log(`  (Ensure ${targetAccountStr} has associated token ${cfg.id} in HashPack)`);
    }
  }

  client.close();
  console.log('\n=======================================================');
  console.log('  Funding Complete!');
  console.log('=======================================================\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
