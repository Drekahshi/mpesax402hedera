import 'dotenv/config';
import {
  Client, AccountId, PrivateKey,
  TokenMintTransaction, TokenId,
  TopicMessageSubmitTransaction, TopicId, Hbar,
} from '@hashgraph/sdk';

const OPERATOR_ID  = process.env.HEDERA_OPERATOR_ID;
const OPERATOR_KEY = process.env.HEDERA_OPERATOR_KEY;
const NETWORK      = process.env.HEDERA_NETWORK ?? 'testnet';
const TOKEN_ID     = process.env.HEDERA_CONNFT_TOKEN_ID;
const TOPIC_ID     = process.env.HEDERA_AUDIT_TOPIC_ID ?? '';

if (!OPERATOR_ID || !OPERATOR_KEY || !TOKEN_ID) {
  console.error('Missing env vars'); process.exit(1);
}

// Metadata MUST be <= 100 bytes per HTS spec.
// Use a short URI slug: "kai://KCNFT/nft1" etc. (< 20 bytes each)
const NFTS = [
  { name: 'Leopard Lookout',  slug: 'kai://KCNFT/nft1', conservationId: 'kai-con-2026-001', eventType: 'wildlife_patrol' },
  { name: 'Jaguar Roar',      slug: 'kai://KCNFT/nft2', conservationId: 'kai-con-2026-002', eventType: 'wildlife_patrol' },
  { name: 'Osprey Sentinel',  slug: 'kai://KCNFT/nft3', conservationId: 'kai-con-2026-003', eventType: 'species_sighting' },
  { name: 'Savanna Trio',     slug: 'kai://KCNFT/nft4', conservationId: 'kai-con-2026-004', eventType: 'ecosystem_survey' },
  { name: 'Ghost Bird',       slug: 'kai://KCNFT/nft5', conservationId: 'kai-con-2026-005', eventType: 'species_sighting' },
];

function buildClient() {
  const client = NETWORK === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(AccountId.fromString(OPERATOR_ID), PrivateKey.fromString(OPERATOR_KEY));
  return client;
}

async function mintOne(client, nft, idx) {
  const tokenId = TokenId.fromString(TOKEN_ID);
  const meta    = Buffer.from(nft.slug, 'utf-8');  // e.g. 17 bytes — well under 100
  console.log('[' + (idx+1) + '/5] Minting "' + nft.name + '" (metadata: ' + nft.slug + ', ' + meta.length + ' bytes)...');

  const mintTx      = await new TokenMintTransaction().setTokenId(tokenId).setMetadata([meta]).setMaxTransactionFee(new Hbar(10)).execute(client);
  const mintReceipt = await mintTx.getReceipt(client);
  const serial      = mintReceipt.serials[0].toNumber();
  const mintTxId    = mintTx.transactionId.toString();
  console.log('  OK  Serial #' + serial + '  Tx: ' + mintTxId);

  if (TOPIC_ID) {
    const hcsTx = await new TopicMessageSubmitTransaction()
      .setTopicId(TopicId.fromString(TOPIC_ID))
      .setMessage(JSON.stringify({ event:'CONSERVATION_NFT_MINT', tokenId:TOKEN_ID, serial, nftName:nft.name, conservationId:nft.conservationId, eventType:nft.eventType, mintTxId, ts:new Date().toISOString(), network:NETWORK }))
      .setMaxTransactionFee(new Hbar(2)).execute(client);
    await hcsTx.getReceipt(client);
    console.log('  HCS logged');
  }
  return { name: nft.name, serial, mintTxId, hashscan: 'https://hashscan.io/' + NETWORK + '/token/' + TOKEN_ID + '/' + serial };
}

async function main() {
  console.log('=================================================');
  console.log('  KAI KCNFT Mint -- First 5 Serials');
  console.log('  Token: ' + TOKEN_ID + '  Network: ' + NETWORK);
  console.log('  Operator: ' + OPERATOR_ID);
  console.log('=================================================');
  const client = buildClient();
  const results = [];
  for (let i = 0; i < NFTS.length; i++) {
    try { results.push(await mintOne(client, NFTS[i], i)); }
    catch (err) { console.error('  FAIL:', err.message ?? err); results.push({ name: NFTS[i].name, error: err.message ?? String(err) }); }
  }
  client.close();
  console.log('\n=== MINT SUMMARY ===');
  for (const r of results) {
    if (r.error) console.log('[FAIL] ' + r.name + ': ' + r.error);
    else { console.log('[OK]   Serial #' + r.serial + '  ' + r.name); console.log('       ' + r.hashscan); }
  }
  console.log('\n  Collection: https://hashscan.io/' + NETWORK + '/token/' + TOKEN_ID);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
