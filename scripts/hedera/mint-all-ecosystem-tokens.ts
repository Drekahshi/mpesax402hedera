/**
 * scripts/hedera/mint-all-ecosystem-tokens.ts
 *
 * Mints 100,000 tokens for each KAI ecosystem token on Hedera Testnet:
 *   - NVR    (0.0.10450060) [decimals: 8]
 *   - yBOB   (0.0.10450061) [decimals: 6]
 *   - YTOKEN (0.0.10450063) [decimals: 8]
 *   - YGOLD  (0.0.10450065) [decimals: 8]
 *   - GAMI   (0.0.10450068) [decimals: 8]
 *   - CENTS  (0.0.10450070) [decimals: 6]
 *   - KBAR   (0.0.10449901) [decimals: 6]
 *
 * Usage:
 *   npx tsx scripts/hedera/mint-all-ecosystem-tokens.ts [optional_recipient_account_id]
 */

import 'dotenv/config';
import {
  Client,
  AccountId,
  PrivateKey,
  TokenMintTransaction,
  TransferTransaction,
  TokenId,
  Hbar,
} from '@hashgraph/sdk';

const OPERATOR_ID  = process.env.HEDERA_OPERATOR_ID;
const OPERATOR_KEY = process.env.HEDERA_OPERATOR_KEY;
const NETWORK      = (process.env.HEDERA_NETWORK ?? 'testnet') as 'testnet' | 'mainnet';

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

  const targetAccountStr = process.argv[2] || OPERATOR_ID;

  console.log('=======================================================');
  console.log('  KAI Ecosystem Token Minting (100k each)');
  console.log('=======================================================');
  console.log(`  Network   : ${NETWORK}`);
  console.log(`  Operator  : ${OPERATOR_ID}`);
  console.log(`  Recipient : ${targetAccountStr}`);
  console.log(`  Amount    : 100,000 of each token`);
  console.log('=======================================================\n');

  const client = NETWORK === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
  const operatorId = AccountId.fromString(OPERATOR_ID);
  const operatorKey = PrivateKey.fromString(OPERATOR_KEY);
  const recipientId = AccountId.fromString(targetAccountStr);

  client.setOperator(operatorId, operatorKey);

  const results: Record<string, { tokenId: string; minted: number; status: string; txId?: string }> = {};

  for (const [sym, cfg] of Object.entries(TOKENS)) {
    console.log(`\n── Minting 100,000 ${sym} (${cfg.id}) ──`);
    const rawAmount = cfg.amount * Math.pow(10, cfg.decimals);
    const tokenId = TokenId.fromString(cfg.id);

    try {
      // 1. Mint 100,000 tokens to treasury
      const mintTx = await new TokenMintTransaction()
        .setTokenId(tokenId)
        .setAmount(rawAmount)
        .setMaxTransactionFee(new Hbar(10))
        .execute(client);

      const mintReceipt = await mintTx.getReceipt(client);
      const mintTxId = mintTx.transactionId.toString();
      console.log(`  ✅ Minted 100,000 ${sym} to treasury (Tx: ${mintTxId})`);
      console.log(`     Total Supply now: ${mintReceipt.totalSupply?.toString()}`);

      // 2. If target is different from operator, transfer 100k to target account
      if (targetAccountStr !== OPERATOR_ID) {
        try {
          const transferTx = await new TransferTransaction()
            .addTokenTransfer(tokenId, operatorId, -rawAmount)
            .addTokenTransfer(tokenId, recipientId, rawAmount)
            .setMaxTransactionFee(new Hbar(5))
            .execute(client);

          await transferTx.getReceipt(client);
          console.log(`  ✅ Transferred 100,000 ${sym} to ${targetAccountStr}`);
        } catch (xferErr: any) {
          console.warn(`  ⚠️ Transfer to ${targetAccountStr} skipped/failed: ${xferErr?.message || xferErr}`);
          console.log(`     (Note: Ensure ${targetAccountStr} has associated token ${cfg.id})`);
        }
      }

      results[sym] = {
        tokenId: cfg.id,
        minted: cfg.amount,
        status: 'SUCCESS',
        txId: mintTxId,
      };
    } catch (err: any) {
      console.error(`  ❌ Failed to mint ${sym}:`, err?.message || err);
      results[sym] = {
        tokenId: cfg.id,
        minted: 0,
        status: `FAILED: ${err?.message || err}`,
      };
    }
  }

  client.close();

  console.log('\n=======================================================');
  console.log('  Mint Summary');
  console.log('=======================================================');
  for (const [sym, r] of Object.entries(results)) {
    console.log(`  ${sym.padEnd(8)} ${r.tokenId.padEnd(16)} ${r.status} ${r.txId ? `(Tx: ${r.txId})` : ''}`);
  }
  console.log('=======================================================\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
