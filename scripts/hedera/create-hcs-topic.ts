/**
 * scripts/hedera/create-hcs-topic.ts
 * Phase 3 — Create the Hedera Consensus Service audit topic.
 *
 * Every mint, transfer, and x402 payment gets a consensus-timestamped record
 * on this topic (PRD Section 3.4). The topic is public (no submit key) so
 * any observer can independently verify the audit trail.
 *
 * Run:
 *   npx ts-node --esm scripts/hedera/create-hcs-topic.ts
 *
 * Writes to console:
 *   HEDERA_AUDIT_TOPIC_ID=0.0.xxxxxx
 *
 * Env vars required:
 *   HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY, HEDERA_NETWORK
 */

import 'dotenv/config';
import {
  Client,
  AccountId,
  PrivateKey,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  Hbar,
} from '@hashgraph/sdk';

const OPERATOR_ID  = process.env.HEDERA_OPERATOR_ID!;
const OPERATOR_KEY = process.env.HEDERA_OPERATOR_KEY!;
const NETWORK      = (process.env.HEDERA_NETWORK ?? 'testnet') as 'testnet' | 'mainnet';

if (!OPERATOR_ID || !OPERATOR_KEY) {
  console.error('ERROR: HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set in .env');
  process.exit(1);
}

function buildClient(): Client {
  const client = NETWORK === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(AccountId.fromString(OPERATOR_ID), PrivateKey.fromString(OPERATOR_KEY));
  return client;
}

async function main() {
  const client    = buildClient();
  const adminKey  = PrivateKey.fromString(OPERATOR_KEY);

  console.log(`\n📡 Creating HCS audit topic on Hedera ${NETWORK}...`);
  console.log(`   Operator: ${OPERATOR_ID}`);
  console.log(`   Topic will be public (no submit key — anyone can verify)`);

  // No setSubmitKey → topic is open for public reads and operator writes.
  // Admin key retained so the topic memo can be updated if needed.
  const createTx = await new TopicCreateTransaction()
    .setAdminKey(adminKey.publicKey)
    .setTopicMemo('KAI Nuvari audit trail — HTS mints, transfers, x402 payments')
    .setMaxTransactionFee(new Hbar(5))
    .execute(client);

  const receipt = await createTx.getReceipt(client);
  const topicId = receipt.topicId!;

  console.log(`\n✅ HCS topic created!`);
  console.log(`   Topic ID : ${topicId.toString()}`);
  console.log(`   Tx ID    : ${createTx.transactionId.toString()}`);
  console.log(`   Explorer : https://hashscan.io/${NETWORK}/topic/${topicId.toString()}`);

  // Write a genesis message to confirm the topic is working
  const genesisMsg = JSON.stringify({
    event:     'TOPIC_GENESIS',
    operator:  OPERATOR_ID,
    purpose:   'KAI Nuvari audit trail',
    timestamp: new Date().toISOString(),
    network:   NETWORK,
  });

  const msgTx = await new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(genesisMsg)
    .setMaxTransactionFee(new Hbar(2))
    .execute(client);

  await msgTx.getReceipt(client);
  console.log(`\n📝 Genesis message written to topic`);
  console.log(`   Msg Tx : ${msgTx.transactionId.toString()}`);

  console.log('\n─────────────────────────────────────────────────────');
  console.log('Add this to your .env (all services use one topic):');
  console.log('─────────────────────────────────────────────────────');
  console.log(`HEDERA_AUDIT_TOPIC_ID=${topicId.toString()}`);
  console.log('─────────────────────────────────────────────────────\n');

  client.close();
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
