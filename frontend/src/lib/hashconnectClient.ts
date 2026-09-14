/**
 * hashconnectClient.ts
 * Phase 4 — HashConnect v3.0.14 (HashPack) wallet integration.
 *
 * API matched to the installed package:
 *   constructor(LedgerId, projectId, DappMetadata, debug?)
 *   hc.init()              — initialise WalletConnect sessions
 *   hc.pairingEvent        — fires SessionData on successful pair
 *   hc.disconnectionEvent  — fires void on disconnect
 *   hc.pairingString       — getter, available after init(); show as QR
 *   hc.getSigner(accountId)— returns a HashConnectSigner
 *   hc.sendTransaction(accountId, tx) → TransactionReceipt
 *   hc.disconnect()        — end session
 *
 * Two account models coexist (PRD Section 3.3):
 *   • Agent-custodial (operator key in hederaClient.ts) — used for mints
 *   • User-owned HashPack — used for user-initiated transfers/approvals
 *
 * Only the pairing string / WalletConnect topic is stored — never a key.
 *
 * Env vars:
 *   NEXT_PUBLIC_HASHCONNECT_PROJECT_ID
 *   NEXT_PUBLIC_HEDERA_NETWORK  (testnet | mainnet)
 */

import { HashConnect } from 'hashconnect';
import type { SessionData, DappMetadata } from 'hashconnect';
import { LedgerId, AccountId, TransferTransaction, TokenId, NftId, Hbar } from '@hashgraph/sdk';

// ── Constants ─────────────────────────────────────────────────────────────────

const PROJECT_ID =
  process.env.NEXT_PUBLIC_HASHCONNECT_PROJECT_ID ?? 'f63851554285ee5785f0645981c49bf3';

const NETWORK_STR = (process.env.NEXT_PUBLIC_HEDERA_NETWORK ?? 'testnet') as 'testnet' | 'mainnet';

const LEDGER_ID = NETWORK_STR === 'mainnet' ? LedgerId.MAINNET : LedgerId.TESTNET;

export const HASHCONNECT_APP_METADATA: DappMetadata = {
  name: 'KAI Nuvari',
  description: 'AI-Native DeFi & Conservation Payments on Hedera + Ethereum',
  icons: ['https://kai-nuvari.vercel.app/favicon.ico'],
  url:
    typeof window !== 'undefined'
      ? window.location.origin
      : 'http://localhost:3000',
};

const SESSION_KEY = 'kai_hashconnect_session';

// ── State ─────────────────────────────────────────────────────────────────────

let _instance: HashConnect | null = null;
let _session:  SessionData | null = null;

export interface HashPackSession {
  accountIds: string[];
  network:    string;
  pairingString: string | null;
}

export interface HashPackState {
  connected:     boolean;
  session:       HashPackSession | null;
  pairingString: string | null;
}

type StateListener = (state: HashPackState) => void;
const _listeners = new Set<StateListener>();
let _state: HashPackState = { connected: false, session: null, pairingString: null };

function _setState(patch: Partial<HashPackState>) {
  _state = { ..._state, ...patch };
  _listeners.forEach(fn => fn(_state));
}

export function subscribeHashPackState(fn: StateListener): () => void {
  _listeners.add(fn);
  fn(_state);
  return () => _listeners.delete(fn);
}

export function getHashPackState(): HashPackState {
  return _state;
}

// ── Init ──────────────────────────────────────────────────────────────────────

/**
 * Initialise HashConnect. Safe to call multiple times — returns cached instance.
 * Must be called from a browser context.
 */
export async function initHashConnect(): Promise<HashConnect> {
  if (typeof window === 'undefined') {
    throw new Error('[HashConnect] Cannot initialise in SSR context');
  }
  if (_instance) return _instance;

  const hc = new HashConnect(LEDGER_ID, PROJECT_ID, HASHCONNECT_APP_METADATA, false);
  _instance = hc;

  // ── Pairing approved ──────────────────────────────────────────────────────
  hc.pairingEvent.on((sessionData: SessionData) => {
    _session = sessionData;
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        accountIds: sessionData.accountIds,
        network:    sessionData.network,
      }));
    } catch { /* private browsing — ignore */ }
    _setState({
      connected:     true,
      pairingString: null,
      session: {
        accountIds:    sessionData.accountIds,
        network:       sessionData.network,
        pairingString: null,
      },
    });
    console.log('[HashConnect] Paired:', sessionData.accountIds);
  });

  // ── Disconnected ──────────────────────────────────────────────────────────
  hc.disconnectionEvent.on(() => {
    _session = null;
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
    _setState({ connected: false, session: null, pairingString: null });
    console.log('[HashConnect] Disconnected');
  });

  // ── Connection status changed ─────────────────────────────────────────────
  hc.connectionStatusChangeEvent.on((status) => {
    console.log('[HashConnect] Status:', status);
  });

  // Initialise (establishes WalletConnect client, loads saved sessions)
  await hc.init();

  // Expose pairing string so the UI can render a QR code
  const pairingString = hc.pairingString ?? null;
  if (pairingString) {
    _setState({ ..._state, pairingString });
  }

  // Restore previously paired session from sessionStorage
  _tryRestoreSession();

  return hc;
}

function _tryRestoreSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as { accountIds: string[]; network: string };
    if (saved.accountIds?.length) {
      _setState({
        connected: true,
        session: {
          accountIds:    saved.accountIds,
          network:       saved.network,
          pairingString: null,
        },
      });
    }
  } catch { /* ignore */ }
}

// ── Pairing ───────────────────────────────────────────────────────────────────

/**
 * Returns the current pairing string (QR code data) for connecting HashPack.
 * The HashPack browser extension detects the WalletConnect session automatically;
 * the pairing string is for mobile or cross-device use.
 */
export async function pairWithHashPack(): Promise<string> {
  const hc = await initHashConnect();
  const pairingString = hc.pairingString;
  if (pairingString) {
    _setState({ ..._state, pairingString });
    return pairingString;
  }
  return '';
}

/**
 * Open the native HashPack pairing modal which triggers the browser extension.
 */
export async function openHashPackPairingModal(): Promise<void> {
  const hc = await initHashConnect();
  await hc.openPairingModal('dark', '#18291f', '#63b3ed', '#90cdf4', '16px');
}

/**
 * Disconnect the active HashPack session.
 */
export async function disconnectHashPack(): Promise<void> {
  if (!_instance) return;
  await _instance.disconnect();
  _session = null;
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  _setState({ connected: false, session: null, pairingString: null });
}

// ── Transaction helpers ───────────────────────────────────────────────────────

/**
 * Get the first connected account ID as an AccountId object.
 * Throws if no session is active.
 */
function _requireAccount(): AccountId {
  if (!_session?.accountIds?.length) {
    throw new Error('[HashConnect] No active HashPack session — pair first');
  }
  return AccountId.fromString(_session.accountIds[0]);
}

// ── Type bridge ───────────────────────────────────────────────────────────────
// hashconnect v3 bundles its own copy of @hashgraph/sdk internally. When both
// packages are installed, TypeScript sees two incompatible AccountId/Transaction
// types. We cast at the call boundary — standard pattern until hashconnect
// moves to a peer-dependency model.
/* eslint-disable @typescript-eslint/no-explicit-any */
const _hc = (v: unknown): any => v;
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Request the connected HashPack wallet to sign and submit an HBAR transfer.
 */
export async function requestHbarTransfer(params: {
  toAccountId:  string;
  amountHbar:   number;
  memo?:        string;
}): Promise<{ transactionId: string; status: string }> {
  const hc        = await initHashConnect();
  const accountId = _requireAccount();

  const tx = new TransferTransaction()
    .addHbarTransfer(accountId,                               new Hbar(-params.amountHbar))
    .addHbarTransfer(AccountId.fromString(params.toAccountId), new Hbar(params.amountHbar));

  if (params.memo) tx.setTransactionMemo(params.memo);

  const signer = hc.getSigner(_hc(accountId));
  await _hc(tx).freezeWithSigner(signer);
  const receipt = await hc.sendTransaction(_hc(accountId), _hc(tx));

  return {
    transactionId: _hc(receipt).transactionId?.toString() ?? '',
    status:        receipt.status.toString(),
  };
}

/**
 * Request the HashPack wallet to sign an HTS fungible token transfer.
 */
export async function requestHtsTransfer(params: {
  toAccountId: string;
  tokenId:     string;
  amount:      number;
  memo?:       string;
}): Promise<{ transactionId: string; status: string }> {
  const hc        = await initHashConnect();
  const accountId = _requireAccount();
  const tokenId   = TokenId.fromString(params.tokenId);
  const toId      = AccountId.fromString(params.toAccountId);

  const tx = new TransferTransaction()
    .addTokenTransfer(tokenId, accountId, -params.amount)
    .addTokenTransfer(tokenId, toId,       params.amount);

  if (params.memo) tx.setTransactionMemo(params.memo);

  const signer = hc.getSigner(_hc(accountId));
  await _hc(tx).freezeWithSigner(signer);
  const receipt = await hc.sendTransaction(_hc(accountId), _hc(tx));

  return {
    transactionId: _hc(receipt).transactionId?.toString() ?? '',
    status:        receipt.status.toString(),
  };
}

/**
 * Request the HashPack wallet to sign an NFT transfer.
 */
export async function requestNftTransfer(params: {
  toAccountId:  string;
  tokenId:      string;
  serialNumber: number;
  memo?:        string;
}): Promise<{ transactionId: string; status: string }> {
  const hc        = await initHashConnect();
  const accountId = _requireAccount();
  const tokenId   = TokenId.fromString(params.tokenId);
  const toId      = AccountId.fromString(params.toAccountId);
  const nftId     = new NftId(tokenId, params.serialNumber);

  const tx = new TransferTransaction()
    .addNftTransfer(nftId, accountId, toId);

  if (params.memo) tx.setTransactionMemo(params.memo);

  const signer = hc.getSigner(_hc(accountId));
  await _hc(tx).freezeWithSigner(signer);
  const receipt = await hc.sendTransaction(_hc(accountId), _hc(tx));

  return {
    transactionId: _hc(receipt).transactionId?.toString() ?? '',
    status:        receipt.status.toString(),
  };
}

// ── Accessors ─────────────────────────────────────────────────────────────────

export function getHashConnect(): HashConnect | null {
  return _instance;
}

export function getActiveSession(): SessionData | null {
  return _session;
}
