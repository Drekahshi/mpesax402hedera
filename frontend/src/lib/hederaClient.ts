/**
 * hederaClient.ts
 * Hedera SDK foundation — Phase 1 of the Hedera-native rails.
 *
 * Exports:
 *   getHederaClient()           — operator client (server-side only)
 *   getHederaAccountBalance()   — HBAR + HTS token balances via SDK
 *   transferHbar()              — signed HBAR transfer from operator account
 *   associateToken()            — associate an HTS token with an account
 *   transferHts()               — transfer an HTS fungible token
 *   transferNft()               — transfer an HTS NFT
 *   getTransactionReceipt()     — fetch receipt by transaction ID string
 *
 * Security: private key is read from server-side env only — never exposed
 * to the client. All functions that call getHederaClient() are server-side.
 */

import {
  Client,
  AccountId,
  PrivateKey,
  AccountBalanceQuery,
  TransferTransaction,
  TokenAssociateTransaction,
  TokenMintTransaction,
  TokenId,
  NftId,
  TransactionId,
  TransactionReceiptQuery,
  Hbar,
  type AccountBalance,
} from '@hashgraph/sdk';

// ── Network config ────────────────────────────────────────────────────────────

const NETWORK = (process.env.HEDERA_NETWORK ?? 'testnet') as 'testnet' | 'mainnet';

/**
 * Build and return a configured Hedera client.
 * Returns null if operator credentials are missing (safe for client bundles
 * that import this file but never call server-side functions).
 */
export function getHederaClient(): Client | null {
  const operatorIdStr  = process.env.HEDERA_OPERATOR_ID;
  const operatorKeyStr = process.env.HEDERA_OPERATOR_KEY;

  if (!operatorIdStr || !operatorKeyStr) {
    console.warn('[Hedera] Operator credentials missing — set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY');
    return null;
  }

  try {
    const operatorId  = AccountId.fromString(operatorIdStr);
    const operatorKey = PrivateKey.fromString(operatorKeyStr);

    const client = NETWORK === 'mainnet'
      ? Client.forMainnet()
      : Client.forTestnet();

    client.setOperator(operatorId, operatorKey);
    // Conservative request timeout — prevents hanging in serverless environments
    client.setRequestTimeout(30_000);
    return client;
  } catch (err) {
    console.error('[Hedera] Failed to initialise client:', err);
    return null;
  }
}

// ── Balance query ─────────────────────────────────────────────────────────────

export interface HederaBalance {
  accountId: string;
  hbars: string;           // e.g. "12.5 ℏ"
  hbarsInTinybar: string;  // raw tinybar string
  tokens: Record<string, string>; // tokenId → balance string
}

/**
 * Query HBAR + all HTS token balances for an account via the Hedera SDK.
 * Uses a consensus node query — for read-heavy use prefer mirrorNode.ts.
 */
export async function getHederaAccountBalance(
  accountIdStr: string,
): Promise<HederaBalance> {
  const client = getHederaClient();
  if (!client) throw new Error('[Hedera] Client not initialised — check env vars');

  const accountId = AccountId.fromString(accountIdStr);
  const balance: AccountBalance = await new AccountBalanceQuery()
    .setAccountId(accountId)
    .execute(client);

  const tokens: Record<string, string> = {};
  if (balance.tokens) {
    for (const [tokenId, amount] of balance.tokens) {
      tokens[tokenId.toString()] = amount.toString();
    }
  }

  return {
    accountId: accountIdStr,
    hbars: balance.hbars.toString(),
    hbarsInTinybar: balance.hbars.toTinybars().toString(),
    tokens,
  };
}

// ── HBAR transfer ─────────────────────────────────────────────────────────────

export interface TransferResult {
  status: string;
  transactionId: string;
  explorerUrl: string;
}

/**
 * Transfer HBAR from the operator account to a recipient.
 * amount is in whole HBAR (not tinybar).
 */
export async function transferHbar(
  toAccountIdStr: string,
  amountHbar: number,
): Promise<TransferResult> {
  const client = getHederaClient();
  if (!client) throw new Error('[Hedera] Client not initialised');

  const operatorIdStr = process.env.HEDERA_OPERATOR_ID!;
  const fromId = AccountId.fromString(operatorIdStr);
  const toId   = AccountId.fromString(toAccountIdStr);

  const txResponse = await new TransferTransaction()
    .addHbarTransfer(fromId, new Hbar(-amountHbar))
    .addHbarTransfer(toId,   new Hbar(amountHbar))
    .execute(client);

  const receipt = await txResponse.getReceipt(client);
  const txId    = txResponse.transactionId.toString();

  return {
    status: receipt.status.toString(),
    transactionId: txId,
    explorerUrl: _explorerTxUrl(txId),
  };
}

// ── HTS token association ─────────────────────────────────────────────────────

/**
 * Associate one or more HTS tokens with an account so it can receive them.
 * The account's key must sign — here the operator signs for its own account.
 */
export async function associateToken(
  accountIdStr: string,
  tokenIds: string[],
): Promise<TransferResult> {
  const client = getHederaClient();
  if (!client) throw new Error('[Hedera] Client not initialised');

  const accountId = AccountId.fromString(accountIdStr);
  const ids       = tokenIds.map(t => TokenId.fromString(t));

  const txResponse = await new TokenAssociateTransaction()
    .setAccountId(accountId)
    .setTokenIds(ids)
    .execute(client);

  const receipt = await txResponse.getReceipt(client);
  const txId    = txResponse.transactionId.toString();

  return {
    status: receipt.status.toString(),
    transactionId: txId,
    explorerUrl: _explorerTxUrl(txId),
  };
}

// ── HTS fungible token transfer ───────────────────────────────────────────────

/**
 * Transfer an HTS fungible token from operator to recipient.
 * amount is in the token's smallest unit (i.e. already adjusted for decimals).
 */
export async function transferHts(
  tokenIdStr: string,
  toAccountIdStr: string,
  amount: number,
): Promise<TransferResult> {
  const client = getHederaClient();
  if (!client) throw new Error('[Hedera] Client not initialised');

  const operatorIdStr = process.env.HEDERA_OPERATOR_ID!;
  const tokenId    = TokenId.fromString(tokenIdStr);
  const fromId     = AccountId.fromString(operatorIdStr);
  const toId       = AccountId.fromString(toAccountIdStr);

  const txResponse = await new TransferTransaction()
    .addTokenTransfer(tokenId, fromId, -amount)
    .addTokenTransfer(tokenId, toId,    amount)
    .execute(client);

  const receipt = await txResponse.getReceipt(client);
  const txId    = txResponse.transactionId.toString();

  return {
    status: receipt.status.toString(),
    transactionId: txId,
    explorerUrl: _explorerTxUrl(txId),
  };
}

// ── HTS NFT transfer ──────────────────────────────────────────────────────────

/**
 * Transfer an HTS NFT (non-fungible serial) from operator to recipient.
 */
export async function transferNft(
  tokenIdStr: string,
  serialNumber: number,
  toAccountIdStr: string,
): Promise<TransferResult> {
  const client = getHederaClient();
  if (!client) throw new Error('[Hedera] Client not initialised');

  const operatorIdStr = process.env.HEDERA_OPERATOR_ID!;
  const nftId = new NftId(TokenId.fromString(tokenIdStr), serialNumber);
  const fromId = AccountId.fromString(operatorIdStr);
  const toId   = AccountId.fromString(toAccountIdStr);

  const txResponse = await new TransferTransaction()
    .addNftTransfer(nftId, fromId, toId)
    .execute(client);

  const receipt = await txResponse.getReceipt(client);
  const txId    = txResponse.transactionId.toString();

  return {
    status: receipt.status.toString(),
    transactionId: txId,
    explorerUrl: _explorerTxUrl(txId),
  };
}

// ── HTS Token Minting ─────────────────────────────────────────────────────────

export interface MintResult extends TransferResult {
  amount: number;
  recipient: string;
  tokenId: string;
  totalSupply?: string;
}

/**
 * Mint HTS fungible tokens to treasury and immediately transfer them to the recipient.
 * amount is in human-readable token units (e.g. 500 for 500 tokens).
 */
export async function mintHtsToken(
  tokenIdStr: string,
  toAccountIdStr: string,
  amount: number,
  decimals: number = 6,
): Promise<MintResult> {
  const client = getHederaClient();
  if (!client) throw new Error('[Hedera] Client not initialised');

  const operatorIdStr = process.env.HEDERA_OPERATOR_ID!;
  const tokenId       = TokenId.fromString(tokenIdStr);
  const operatorId    = AccountId.fromString(operatorIdStr);
  const recipientId   = AccountId.fromString(toAccountIdStr);
  const rawAmount     = Math.round(amount * Math.pow(10, decimals));

  // 1. Mint tokens to treasury (operator)
  const mintTx = await new TokenMintTransaction()
    .setTokenId(tokenId)
    .setAmount(rawAmount)
    .setMaxTransactionFee(new Hbar(5))
    .execute(client);
  const mintReceipt = await mintTx.getReceipt(client);

  // 2. Transfer from treasury (operator) to recipient
  const transferTx = await new TransferTransaction()
    .addTokenTransfer(tokenId, operatorId,  -rawAmount)
    .addTokenTransfer(tokenId, recipientId,  rawAmount)
    .setMaxTransactionFee(new Hbar(5))
    .execute(client);
  const transferReceipt = await transferTx.getReceipt(client);
  const txId = transferTx.transactionId.toString();

  return {
    status: transferReceipt.status.toString(),
    transactionId: txId,
    explorerUrl: _explorerTxUrl(txId),
    amount,
    recipient: toAccountIdStr,
    tokenId: tokenIdStr,
    totalSupply: mintReceipt.totalSupply?.toString(),
  };
}

// ── Receipt query ─────────────────────────────────────────────────────────────

/**
 * Fetch a transaction receipt by its string-encoded transaction ID.
 * Useful for confirming a transaction that was submitted from another context.
 */
export async function getTransactionReceipt(txIdStr: string) {
  const client = getHederaClient();
  if (!client) throw new Error('[Hedera] Client not initialised');

  const txId    = TransactionId.fromString(txIdStr);
  const receipt = await new TransactionReceiptQuery()
    .setTransactionId(txId)
    .execute(client);

  return {
    status: receipt.status.toString(),
    transactionId: txIdStr,
    accountId: receipt.accountId?.toString() ?? null,
    tokenId:   receipt.tokenId?.toString()   ?? null,
    topicId:   receipt.topicId?.toString()   ?? null,
    serials:   receipt.serials?.map(s => s.toString()) ?? [],
    explorerUrl: _explorerTxUrl(txIdStr),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _explorerTxUrl(txId: string): string {
  const base = NETWORK === 'mainnet'
    ? 'https://hashscan.io/mainnet/transaction'
    : 'https://hashscan.io/testnet/transaction';
  // HashScan uses @ notation: accountId@seconds.nanos
  return `${base}/${txId.replace('@', '-').replace('.', '-')}`;
}
