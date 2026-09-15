/**
 * scripts/hedera/mint-nvr-direct.ts
 *
 * Mints 100,000 NVR (token ID: 0.0.10450060, 8 decimals) and transfers to 0.0.5883612.
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

const OPERATOR_ID  = process.env.HEDERA_OPERATOR_ID!;
const OPERATOR_KEY = process.env.HEDERA_OPERATOR_KEY!;
const NETWORK      = (process.env.HEDERA_NETWORK ?? 'testnet') as 'testnet' | 'mainnet';
const RECIPIENT_ID = process.argv[2] || '0.0.5883612';
const TOKEN_ID     = process.env.HEDERA_NVR_TOKEN_ID ?? '0.0.10450060';
const DECIMALS     = 8;
const AMOUNT_NVR   = 100_000;

async function main() {
  if (!OPERATOR_ID || !OPERATOR_KEY) {
    console.error('ERROR: HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set in .env');
    process.exit(1);
  }

  console.log('=======================================================');
  console.log('  Minting & Transferring 100,000 NVR');
  console.log('=======================================================');
  console.log(`  Network   : ${NETWORK}`);
  console.log(`  Operator  : ${OPERATOR_ID}`);
  console.log(`  Recipient : ${RECIPIENT_ID}`);
  console.log(`  Token ID  : ${TOKEN_ID}`);
  console.log(`  Amount    : ${AMOUNT_NVR.toLocaleString()} NVR`);
  console.log('=======================================================\n');

  const client = NETWORK === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
  const operatorId = AccountId.fromString(OPERATOR_ID);
  const operatorKey = PrivateKey.fromString(OPERATOR_KEY);
  const recipientId = AccountId.fromString(RECIPIENT_ID);
  const tokenId = TokenId.fromString(TOKEN_ID);

  client.setOperator(operatorId, operatorKey);

  // 100,000 with 8 decimals: 100,000 * 10^8 = 10,000,000,000,000
  const rawAmount = AMOUNT_NVR * Math.pow(10, DECIMALS);

  // Step 1: Mint 100k NVR to treasury
  console.log('>> Step 1: Minting 100,000 NVR to treasury...');
  const mintTx = await new TokenMintTransaction()
    .setTokenId(tokenId)
    .setAmount(rawAmount)
    .setMaxTransactionFee(new Hbar(10))
    .execute(client);

  const mintReceipt = await mintTx.getReceipt(client);
  console.log(`  ✅ Minted! Status: ${mintReceipt.status.toString()}`);
  console.log(`     Total Supply: ${mintReceipt.totalSupply?.toString()}`);
  console.log(`     Tx ID: ${mintTx.transactionId.toString()}`);

  // Step 2: Transfer 100k NVR to recipient
  console.log(`\n>> Step 2: Transferring 100,000 NVR to ${RECIPIENT_ID}...`);
  const transferTx = await new TransferTransaction()
    .addTokenTransfer(tokenId, operatorId, -rawAmount)
    .addTokenTransfer(tokenId, recipientId, rawAmount)
    .setMaxTransactionFee(new Hbar(10))
    .execute(client);

  const transferReceipt = await transferTx.getReceipt(client);
  console.log(`  ✅ Transferred! Status: ${transferReceipt.status.toString()}`);
  console.log(`     Tx ID: ${transferTx.transactionId.toString()}`);

  client.close();

  console.log('\n=======================================================');
  console.log('  Done! 100,000 NVR successfully transferred to ' + RECIPIENT_ID);
  console.log('  Explorer: https://hashscan.io/testnet/account/' + RECIPIENT_ID);
  console.log('=======================================================\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
