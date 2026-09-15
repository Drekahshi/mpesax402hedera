/**
 * transfer-20k-tokens.mjs
 *
 * Transfers 20,000 of each KAI HTS token to a target Hedera account ID.
 *
 * Usage:
 *   node scripts/transfer-20k-tokens.mjs <targetAccountId>
 *   Example: node scripts/transfer-20k-tokens.mjs 0.0.5834216
 */

import {
  Client,
  AccountId,
  PrivateKey,
  TransferTransaction,
  TokenMintTransaction,
  TokenId,
} from '@hashgraph/sdk';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local
dotenv.config({ path: join(__dirname, '../.env.local') });

const OPERATOR_ID = process.env.HEDERA_OPERATOR_ID;
const OPERATOR_KEY = process.env.HEDERA_OPERATOR_KEY;
const NETWORK = process.env.HEDERA_NETWORK || 'testnet';

const HTS_TOKENS = {
  NVR:    { id: process.env.NEXT_PUBLIC_NVR_HTS_TOKEN_ID    ?? '0.0.10450060', decimals: 8 },
  YBOB:   { id: process.env.NEXT_PUBLIC_YBOB_HTS_TOKEN_ID   ?? '0.0.10450061', decimals: 6 },
  YTOKEN: { id: process.env.NEXT_PUBLIC_YTOKEN_HTS_TOKEN_ID ?? '0.0.10450063', decimals: 8 },
  YGOLD:  { id: process.env.NEXT_PUBLIC_YGOLD_HTS_TOKEN_ID   ?? '0.0.10450065', decimals: 8 },
  GAMI:   { id: process.env.NEXT_PUBLIC_GAMI_HTS_TOKEN_ID    ?? '0.0.10450068', decimals: 8 },
  CENTS:  { id: process.env.NEXT_PUBLIC_CENTS_HTS_TOKEN_ID   ?? '0.0.10450070', decimals: 6 },
  KBAR:   { id: process.env.NEXT_PUBLIC_KAIBAR_TOKEN_ID      ?? '0.0.10449901', decimals: 6 },
};

const AMOUNT_EACH = 20000;

async function main() {
  const targetAccountId = process.argv[2] || OPERATOR_ID;

  if (!OPERATOR_ID || !OPERATOR_KEY) {
    console.error('❌ Missing HEDERA_OPERATOR_ID or HEDERA_OPERATOR_KEY in .env.local');
    process.exit(1);
  }

  console.log(`\n🚀 Initializing Hedera Token Transfer (20,000 each)`);
  console.log(`   Network:         ${NETWORK}`);
  console.log(`   Operator (From): ${OPERATOR_ID}`);
  console.log(`   Target (To):     ${targetAccountId}`);
  console.log(`   Amount:          ${AMOUNT_EACH.toLocaleString()} tokens per asset\n`);

  const client = Client.forTestnet();
  client.setOperator(AccountId.fromString(OPERATOR_ID), PrivateKey.fromStringECDSA(OPERATOR_KEY));

  const isSelf = targetAccountId === OPERATOR_ID;

  for (const [symbol, token] of Object.entries(HTS_TOKENS)) {
    const rawAmount = AMOUNT_EACH * Math.pow(10, token.decimals);
    const tokenId = TokenId.fromString(token.id);

    try {
      if (isSelf) {
        // If target is operator/treasury, mint supply to treasury
        console.log(`🪙 Minting ${AMOUNT_EACH.toLocaleString()} ${symbol} (${token.id}) to Treasury...`);
        const mintTx = await new TokenMintTransaction()
          .setTokenId(tokenId)
          .setAmount(rawAmount)
          .execute(client);
        const receipt = await mintTx.getReceipt(client);
        console.log(`   ✓ Minted! Status: ${receipt.status.toString()}`);
      } else {
        // Transfer from treasury to target account
        console.log(`📤 Transferring ${AMOUNT_EACH.toLocaleString()} ${symbol} (${token.id}) to ${targetAccountId}...`);
        const tx = await new TransferTransaction()
          .addTokenTransfer(tokenId, AccountId.fromString(OPERATOR_ID), -rawAmount)
          .addTokenTransfer(tokenId, AccountId.fromString(targetAccountId), rawAmount)
          .execute(client);
        const receipt = await tx.getReceipt(client);
        console.log(`   ✓ Transferred! Status: ${receipt.status.toString()}`);
      }
    } catch (err) {
      console.warn(`   ⚠️ ${symbol} notice: ${err.message}`);
      console.log(`      (Make sure ${targetAccountId} is associated with token ${token.id})`);
    }
  }

  console.log(`\n🎉 Completed 20k token operation for all 7 HTS tokens!\n`);
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
