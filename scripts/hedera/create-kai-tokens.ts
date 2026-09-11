/**
 * scripts/hedera/create-kai-tokens.ts
 * Deploy the full KAI Nuvari token ecosystem as native HTS fungible tokens.
 *
 * Deploys 6 tokens:
 *   NVR     — NVR Governance          (symbol: NVR,    decimals: 8,  100k initial)
 *   yBOB    — yBOB Stable             (symbol: YBOB,   decimals: 6,  100k initial)
 *   YTOKEN  — Y Token ETF             (symbol: YTOKEN, decimals: 8,  100k initial)
 *   YGOLD   — YGold ETF               (symbol: YGOLD,  decimals: 8,  100k initial)
 *   GAMI    — GAMI Rewards            (symbol: GAMI,   decimals: 8,  100k initial)
 *   CENTS   — Nuvari Cents            (symbol: CENTS,  decimals: 6,  100k initial)
 *
 * All tokens:
 *   - Treasury = operator account (0.0.5834216)
 *   - Supply key = operator (can mint more)
 *   - Admin key = operator (can update token properties)
 *   - Supply type = INFINITE (mint on demand)
 *   - 100,000 tokens minted to treasury at creation
 *
 * Run:
 *   npx tsx scripts/hedera/create-kai-tokens.ts
 *
 * Env vars required:
 *   HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY, HEDERA_NETWORK
 */

import 'dotenv/config';
import {
  Client,
  AccountId,
  PrivateKey,
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
  TokenMintTransaction,
  Hbar,
} from '@hashgraph/sdk';
import * as fs from 'fs';
import * as path from 'path';

// ── Config ────────────────────────────────────────────────────────────────────

const OPERATOR_ID  = process.env.HEDERA_OPERATOR_ID!;
const OPERATOR_KEY = process.env.HEDERA_OPERATOR_KEY!;
const NETWORK      = (process.env.HEDERA_NETWORK ?? 'testnet') as 'testnet' | 'mainnet';

if (!OPERATOR_ID || !OPERATOR_KEY) {
  console.error('ERROR: HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set in .env');
  process.exit(1);
}

// ── KAI Token definitions ─────────────────────────────────────────────────────

interface TokenDef {
  name:        string;
  symbol:      string;
  decimals:    number;
  initialMint: number;   // in whole tokens (script converts to raw units)
  memo:        string;
  envKey:      string;   // env var name to write the token ID to
}

const KAI_TOKENS: TokenDef[] = [
  {
    name:        'NVR Governance',
    symbol:      'NVR',
    decimals:    8,
    initialMint: 100_000,
    memo:        'KAI Nuvari — NVR governance and protocol fees token',
    envKey:      'HEDERA_NVR_TOKEN_ID',
  },
  {
    name:        'yBOB Stable',
    symbol:      'YBOB',
    decimals:    6,
    initialMint: 100_000,
    memo:        'KAI Nuvari — yBOB yield-bearing settlement unit',
    envKey:      'HEDERA_YBOB_TOKEN_ID',
  },
  {
    name:        'Y Token ETF',
    symbol:      'YTOKEN',
    decimals:    8,
    initialMint: 100_000,
    memo:        'KAI Nuvari — YTOKEN growth yield vault share',
    envKey:      'HEDERA_YTOKEN_TOKEN_ID',
  },
  {
    name:        'YGold ETF',
    symbol:      'YGOLD',
    decimals:    8,
    initialMint: 100_000,
    memo:        'KAI Nuvari — YGOLD gold-linked reserve asset',
    envKey:      'HEDERA_YGOLD_TOKEN_ID',
  },
  {
    name:        'GAMI Rewards',
    symbol:      'GAMI',
    decimals:    8,
    initialMint: 100_000,
    memo:        'KAI Nuvari — GAMI community incentives and rewards',
    envKey:      'HEDERA_GAMI_TOKEN_ID',
  },
  {
    name:        'Nuvari Cents',
    symbol:      'CENTS',
    decimals:    6,
    initialMint: 100_000,
    memo:        'KAI Nuvari — CENTS micro-savings and x402 payment fees',
    envKey:      'HEDERA_CENTS_TOKEN_ID',
  },
];

// ── Client setup ──────────────────────────────────────────────────────────────

function buildClient(): Client {
  const client = NETWORK === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(
    AccountId.fromString(OPERATOR_ID),
    PrivateKey.fromString(OPERATOR_KEY),
  );
  client.setRequestTimeout(30_000);
  return client;
}

// ── Create + mint one token ───────────────────────────────────────────────────

async function createToken(client: Client, def: TokenDef): Promise<string> {
  const operatorId = AccountId.fromString(OPERATOR_ID);
  const supplyKey  = PrivateKey.fromString(OPERATOR_KEY);
  const adminKey   = PrivateKey.fromString(OPERATOR_KEY);

  console.log(`\n  Creating ${def.name} (${def.symbol})...`);

  const createTx = await new TokenCreateTransaction()
    .setTokenName(def.name)
    .setTokenSymbol(def.symbol)
    .setDecimals(def.decimals)
    .setInitialSupply(0)                    // mint separately for cleaner tx history
    .setTokenType(TokenType.FungibleCommon)
    .setSupplyType(TokenSupplyType.Infinite)
    .setTreasuryAccountId(operatorId)
    .setSupplyKey(supplyKey.publicKey)
    .setAdminKey(adminKey.publicKey)
    .setTokenMemo(def.memo)
    .setMaxTransactionFee(new Hbar(30))
    .execute(client);

  const createReceipt = await createTx.getReceipt(client);
  const tokenId       = createReceipt.tokenId!.toString();

  console.log(`  ✅ Created  token ID: ${tokenId}`);
  console.log(`     Tx: ${createTx.transactionId.toString()}`);

  // Mint initial supply
  const rawAmount = def.initialMint * Math.pow(10, def.decimals);

  const mintTx = await new TokenMintTransaction()
    .setTokenId(createReceipt.tokenId!)
    .setAmount(rawAmount)
    .setMaxTransactionFee(new Hbar(10))
    .execute(client);

  const mintReceipt = await mintTx.getReceipt(client);

  console.log(`  💰 Minted  ${def.initialMint.toLocaleString()} ${def.symbol} to treasury`);
  console.log(`     Supply : ${mintReceipt.totalSupply?.toString()}`);
  console.log(`     Tx: ${mintTx.transactionId.toString()}`);

  return tokenId;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const client = buildClient();

  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('  KAI Nuvari Token Deployment — Hedera HTS');
  console.log(`  Network  : ${NETWORK}`);
  console.log(`  Operator : ${OPERATOR_ID}`);
  console.log(`  Tokens   : ${KAI_TOKENS.length} (100,000 each)`);
  console.log('╚═══════════════════════════════════════════════════════╝\n');

  const results: Record<string, { tokenId: string; symbol: string; decimals: number }> = {};
  const envLines: string[] = [
    '',
    '# ── KAI Ecosystem HTS Tokens (Hedera native) ───────────────',
    `# Deployed ${new Date().toISOString()} on ${NETWORK}`,
  ];

  for (const def of KAI_TOKENS) {
    try {
      const tokenId = await createToken(client, def);
      results[def.symbol] = { tokenId, symbol: def.symbol, decimals: def.decimals };
      envLines.push(`${def.envKey}=${tokenId}`);
      envLines.push(`NEXT_PUBLIC_${def.symbol}_HTS_TOKEN_ID=${tokenId}`);
    } catch (err: any) {
      console.error(`  ✗ Failed to create ${def.symbol}: ${err?.message ?? err}`);
      envLines.push(`# ${def.envKey}=FAILED`);
    }
  }

  client.close();

  // ── Print summary ─────────────────────────────────────────────────────────
  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('  DEPLOYMENT SUMMARY');
  console.log('╠═══════════════════════════════════════════════════════╣');
  for (const [sym, r] of Object.entries(results)) {
    const explorer = `https://hashscan.io/${NETWORK}/token/${r.tokenId}`;
    console.log(`  ${sym.padEnd(7)} ${r.tokenId.padEnd(18)}  ${explorer}`);
  }
  console.log('╚═══════════════════════════════════════════════════════╝');

  // ── Write env snippet ─────────────────────────────────────────────────────
  const envSnippet = envLines.join('\n');
  console.log('\nAdd these to your .env and frontend/.env.local:\n');
  console.log('─'.repeat(55));
  console.log(envSnippet);
  console.log('─'.repeat(55));

  // Save to file
  const outPath = path.join(process.cwd(), 'hedera-kai-tokens.json');
  fs.writeFileSync(outPath, JSON.stringify({
    network: NETWORK,
    operator: OPERATOR_ID,
    deployedAt: new Date().toISOString(),
    tokens: results,
  }, null, 2));
  console.log(`\nSaved to: hedera-kai-tokens.json`);
}

main().catch(err => {
  console.error('\nScript failed:', err?.message ?? err);
  process.exit(1);
});
