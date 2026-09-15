'use client';

import { useState, useEffect, useCallback } from 'react';
import { useConnect, useAccount, useDisconnect, useChainId, type Connector } from 'wagmi';
import { X, LogOut, RefreshCw, Wallet, Leaf, ArrowLeftRight, CheckCircle } from 'lucide-react';
import {
  switchToHederaTestnet,
  switchToSepolia,
  chainName,
  CHAIN_IDS,
} from '@/lib/hederaNetwork';
import {
  openHashPackPairingModal,
  disconnectHashPack,
  subscribeHashPackState,
  getHashPackState,
  type HashPackState,
} from '@/lib/hashconnectClient';

interface WalletConnectModalProps {
  onClose: () => void;
}

// ── Connector display metadata ────────────────────────────────────────────────

function getWalletMeta(connector: Connector): {
  icon: React.ReactNode;
  label: string;
  description: string;
  color: string;
  border: string;
  bg: string;
  priority: number;
} {
  const key = `${connector.id} ${connector.name}`.toLowerCase();

  if (key.includes('metamask')) return {
    icon: <MetaMaskIcon />,
    label: 'MetaMask',
    description: 'Browser extension · EVM + Hedera JSON-RPC relay',
    color: '#F6851B',
    border: 'rgba(246,133,27,0.35)',
    bg: 'rgba(246,133,27,0.07)',
    priority: 1,
  };

  if (key.includes('walletconnect')) return {
    icon: <WalletConnectGenericIcon />,
    label: 'WalletConnect (Mobile)',
    description: 'Scan QR code with mobile wallet app (e.g. Rainbow, MetaMask)',
    color: '#3b82f6',
    border: 'rgba(59,130,246,0.35)',
    bg: 'rgba(59,130,246,0.07)',
    priority: 3,
  };

  return {
    icon: <Wallet size={24} color="#22c55e" />,
    label: connector.name || 'Browser Wallet',
    description: 'Injected EIP-1193 wallet (Brave, Rabby, Coinbase)',
    color: '#22c55e',
    border: 'rgba(34,197,94,0.3)',
    bg: 'rgba(34,197,94,0.06)',
    priority: 2,
  };
}

// ── Chain indicator pill ──────────────────────────────────────────────────────

function ChainPill({ chainId, label }: { chainId?: number; label?: string }) {
  const isHedera = label?.toLowerCase().includes('hedera') || chainId === CHAIN_IDS.hederaTestnet || chainId === CHAIN_IDS.hederaMainnet;
  const color    = isHedera ? '#63b3ed' : '#f59e0b';
  const text     = label || (chainId ? chainName(chainId).toUpperCase() : 'HEDERA');
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: 0.8,
      background: isHedera ? 'rgba(99,179,237,0.15)' : 'rgba(245,158,11,0.15)',
      color,
      border: `1px solid ${isHedera ? 'rgba(99,179,237,0.3)' : 'rgba(245,158,11,0.3)'}`,
      borderRadius: 5, padding: '2px 7px',
    }}>
      {text}
    </span>
  );
}

// ── KAI Wallet coming-soon tile ───────────────────────────────────────────────

function KaiWalletTile() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px',
      borderRadius: 14, border: '1px solid rgba(34,197,94,0.2)',
      background: 'rgba(34,197,94,0.03)', position: 'relative', cursor: 'default', opacity: 0.65,
    }}>
      <div style={{
        position: 'absolute', top: 8, right: 10,
        background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)',
        borderRadius: 6, padding: '2px 8px', fontSize: 9, fontWeight: 700, color: '#22c55e', letterSpacing: 1,
      }}>COMING SOON</div>
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: 'linear-gradient(135deg,#15803d,#166534)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <KaiIcon />
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontWeight: 800, color: '#f0fdf4', fontSize: 13, margin: '0 0 2px' }}>KAI Wallet</p>
        <p style={{ fontSize: 11, color: 'rgba(240,253,244,0.45)', margin: 0 }}>
          Native KAI identity · DID · x402 payments
        </p>
      </div>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export default function WalletConnectModal({ onClose }: WalletConnectModalProps) {
  const { connectors, connect, status, error, reset } = useConnect();
  const { address, isConnected, connector: activeConnector } = useAccount();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();

  const [connectingId, setConnectingId]         = useState<string | null>(null);
  const [connectingHashPack, setConnectingHashPack] = useState(false);
  const [hashPackState, setHashPackState]       = useState<HashPackState>(getHashPackState());
  const [switchingNet, setSwitchingNet]         = useState<'hedera' | 'sepolia' | null>(null);
  const [hashPackError, setHashPackError]       = useState<string | null>(null);
  const [switchError,  setSwitchError]          = useState<string | null>(null);

  // Subscribe to HashPack state
  useEffect(() => {
    const unsub = subscribeHashPackState(setHashPackState);
    return unsub;
  }, []);

  // Auto-close after successful connection
  useEffect(() => {
    if (isConnected || hashPackState.connected) {
      const t = setTimeout(onClose, 1100);
      return () => clearTimeout(t);
    }
  }, [isConnected, hashPackState.connected, onClose]);

  useEffect(() => {
    if (status !== 'pending') setConnectingId(null);
  }, [status]);

  const handleConnect = useCallback((connector: Connector) => {
    setConnectingId(connector.id);
    connect({ connector }, { onError: () => setConnectingId(null) });
  }, [connect]);

  const handleConnectHashPack = useCallback(async () => {
    setHashPackError(null);
    try {
      setConnectingHashPack(true);
      await openHashPackPairingModal();
    } catch (err: any) {
      console.error('[HashPack] Connect error:', err);
      setHashPackError(err?.message || 'Failed to connect to HashPack extension');
    } finally {
      setConnectingHashPack(false);
    }
  }, []);

  const handleDisconnectHashPack = useCallback(async () => {
    await disconnectHashPack();
  }, []);

  const handleSwitchToHedera = useCallback(async () => {
    setSwitchingNet('hedera');
    setSwitchError(null);
    try {
      await switchToHederaTestnet();
    } catch (e: any) {
      setSwitchError(e?.message ?? 'Switch failed');
    } finally {
      setSwitchingNet(null);
    }
  }, []);

  const handleSwitchToSepolia = useCallback(async () => {
    setSwitchingNet('sepolia');
    setSwitchError(null);
    try {
      await switchToSepolia();
    } catch (e: any) {
      setSwitchError(e?.message ?? 'Switch failed');
    } finally {
      setSwitchingNet(null);
    }
  }, []);

  // Sort connectors: MetaMask first, generic injected second, WalletConnect third
  const sortedConnectors = [...connectors].sort((a, b) => {
    const pa = getWalletMeta(a).priority;
    const pb = getWalletMeta(b).priority;
    return pa - pb;
  });

  // Deduplicate: skip generic 'injected' if MetaMask is already present
  const hasMetaMask = sortedConnectors.some(c => c.id.toLowerCase().includes('metamask'));
  const visibleConnectors = sortedConnectors.filter(c => {
    if (hasMetaMask && c.id === 'injected' && c.name === 'Injected') return false;
    return true;
  });

  const isOnHedera  = chainId === CHAIN_IDS.hederaTestnet || chainId === CHAIN_IDS.hederaMainnet;
  const isOnSepolia = chainId === CHAIN_IDS.sepolia;
  const isAnyConnected = isConnected || hashPackState.connected;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(12px)',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 420, borderRadius: 24, padding: '22px 20px',
          background: '#18291f', border: '1px solid rgba(34,197,94,0.2)',
          boxShadow: '0 28px 90px rgba(0,0,0,0.65)', position: 'relative',
        }}
      >
        {/* Close */}
        <button onClick={onClose} aria-label="Close" style={{
          position: 'absolute', top: 14, right: 14,
          background: 'rgba(255,255,255,0.06)', border: 'none',
          borderRadius: '50%', width: 30, height: 30, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'rgba(255,255,255,0.45)',
        }}>
          <X size={15} />
        </button>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14, margin: '0 auto 10px',
            background: 'linear-gradient(135deg,#15803d,#166534)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 22px rgba(34,197,94,0.3)',
          }}>
            <Leaf size={24} color="#86efac" />
          </div>
          <h2 style={{ fontSize: 17, fontWeight: 900, color: '#f0fdf4', margin: '0 0 3px' }}>
            Connect Wallet
          </h2>
          <p style={{ fontSize: 11, color: 'rgba(240,253,244,0.45)', margin: 0 }}>
            HashPack Extension · MetaMask · WalletConnect
          </p>
        </div>

        {/* ── Connected state ────────────────────────────────────────────── */}
        {isAnyConnected ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            
            {/* HashPack Connected Row */}
            {hashPackState.connected && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                borderRadius: 14, background: 'rgba(99,179,237,0.08)',
                border: '1px solid rgba(99,179,237,0.25)',
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'rgba(99,179,237,0.15)', border: '2px solid #63b3ed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: '#63b3ed',
                }}>ℏ</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#f0fdf4' }}>HashPack Connected</span>
                    <ChainPill label="HEDERA TESTNET" />
                  </div>
                  <code style={{ fontSize: 11, color: '#63b3ed' }}>
                    {hashPackState.session?.accountIds?.[0] ?? 'Connected'}
                  </code>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginLeft: 6 }}>
                    native Hedera
                  </span>
                </div>
                <button onClick={handleDisconnectHashPack} style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: '#f87171', fontSize: 11, fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <LogOut size={13} />
                </button>
              </div>
            )}

            {/* EVM Connected Row */}
            {isConnected && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                borderRadius: 14, background: 'rgba(34,197,94,0.08)',
                border: '1px solid rgba(34,197,94,0.25)',
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'rgba(34,197,94,0.15)', border: '2px solid #22c55e',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                }}>✓</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#f0fdf4' }}>Connected</span>
                    <ChainPill chainId={chainId} />
                  </div>
                  <code style={{ fontSize: 11, color: '#22c55e' }}>
                    {address?.slice(0, 6)}…{address?.slice(-4)}
                  </code>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginLeft: 6 }}>
                    via {activeConnector?.name}
                  </span>
                </div>
                <button onClick={() => disconnect()} style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: '#f87171', fontSize: 11, fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <LogOut size={13} />
                </button>
              </div>
            )}

            {/* Network switch row for EVM */}
            {isConnected && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleSwitchToHedera}
                  disabled={isOnHedera || switchingNet !== null}
                  style={{
                    flex: 1, padding: '9px 0', borderRadius: 10, fontSize: 11, fontWeight: 700,
                    background: isOnHedera ? 'rgba(99,179,237,0.15)' : 'rgba(99,179,237,0.08)',
                    border: `1px solid ${isOnHedera ? 'rgba(99,179,237,0.5)' : 'rgba(99,179,237,0.25)'}`,
                    color: isOnHedera ? '#63b3ed' : 'rgba(99,179,237,0.7)',
                    cursor: isOnHedera ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  }}>
                  {switchingNet === 'hedera'
                    ? <RefreshCw size={11} style={{ animation: 'spin 1s linear infinite' }} />
                    : isOnHedera
                      ? <CheckCircle size={11} />
                      : <ArrowLeftRight size={11} />
                  }
                  Hedera Testnet
                </button>
                <button
                  onClick={handleSwitchToSepolia}
                  disabled={isOnSepolia || switchingNet !== null}
                  style={{
                    flex: 1, padding: '9px 0', borderRadius: 10, fontSize: 11, fontWeight: 700,
                    background: isOnSepolia ? 'rgba(245,158,11,0.15)' : 'rgba(245,158,11,0.07)',
                    border: `1px solid ${isOnSepolia ? 'rgba(245,158,11,0.5)' : 'rgba(245,158,11,0.2)'}`,
                    color: isOnSepolia ? '#f59e0b' : 'rgba(245,158,11,0.65)',
                    cursor: isOnSepolia ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  }}>
                  {switchingNet === 'sepolia'
                    ? <RefreshCw size={11} style={{ animation: 'spin 1s linear infinite' }} />
                    : isOnSepolia
                      ? <CheckCircle size={11} />
                      : <ArrowLeftRight size={11} />
                  }
                  Sepolia
                </button>
              </div>
            )}

            {switchError && (
              <p style={{ fontSize: 11, color: '#f87171', margin: 0, textAlign: 'center' }}>
                {switchError}
              </p>
            )}
          </div>
        ) : (
          /* ── Wallet list ───────────────────────────────────────────────── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>

            {/* Network info banner */}
            <div style={{
              padding: '8px 12px', borderRadius: 10,
              background: 'rgba(99,179,237,0.07)', border: '1px solid rgba(99,179,237,0.2)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <HederaIcon />
              <p style={{ fontSize: 10, color: 'rgba(99,179,237,0.8)', margin: 0, lineHeight: 1.5 }}>
                <strong style={{ color: '#63b3ed' }}>HashPack</strong> is the native Hedera wallet (HBAR, HTS tokens, NFTs).
                <strong style={{ color: '#f6851b', marginLeft: 4 }}>MetaMask</strong> connects via JSON-RPC relay for EVM contracts.
              </p>
            </div>

            {/* 1. HashPack Native Extension Tile */}
            <button
              onClick={handleConnectHashPack}
              disabled={connectingHashPack}
              aria-label="Connect with HashPack"
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '13px 15px', borderRadius: 14, textAlign: 'left',
                border: '1px solid rgba(99,179,237,0.38)', background: 'rgba(99,179,237,0.07)',
                cursor: connectingHashPack ? 'not-allowed' : 'pointer',
                opacity: connectingHashPack ? 0.7 : 1,
                transition: 'all 0.2s', width: '100%',
              }}
            >
              <div style={{
                width: 46, height: 46, borderRadius: 12, background: 'rgba(0,0,0,0.22)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <HashPackIcon />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <p style={{ fontSize: 14, fontWeight: 800, color: '#f0fdf4', margin: 0 }}>
                    HashPack
                  </p>
                  <span style={{
                    fontSize: 8, fontWeight: 700, letterSpacing: 1,
                    background: 'rgba(99,179,237,0.18)', color: '#63b3ed',
                    border: '1px solid rgba(99,179,237,0.35)',
                    borderRadius: 4, padding: '1px 5px',
                  }}>NATIVE EXTENSION</span>
                </div>
                <p style={{ fontSize: 11, color: 'rgba(240,253,244,0.45)', margin: 0 }}>
                  Hedera native · Browser extension popup · HTS tokens
                </p>
              </div>
              {connectingHashPack
                ? <RefreshCw size={15} color="#63b3ed" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                : <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 17, flexShrink: 0 }}>›</span>
              }
            </button>

            {/* 2. EVM Connectors (MetaMask, Injected, WalletConnect) */}
            {visibleConnectors.map(connector => {
              const meta       = getWalletMeta(connector);
              const connecting = status === 'pending' && connectingId === connector.id;

              return (
                <button
                  key={connector.id}
                  onClick={() => handleConnect(connector)}
                  disabled={status === 'pending'}
                  aria-label={`Connect with ${meta.label}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '13px 15px', borderRadius: 14, textAlign: 'left',
                    border: `1px solid ${meta.border}`, background: meta.bg,
                    cursor: status === 'pending' ? 'not-allowed' : 'pointer',
                    opacity: status === 'pending' && !connecting ? 0.5 : 1,
                    transition: 'all 0.2s', width: '100%',
                  }}
                >
                  <div style={{
                    width: 46, height: 46, borderRadius: 12, background: 'rgba(0,0,0,0.22)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    {meta.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <p style={{ fontSize: 14, fontWeight: 800, color: '#f0fdf4', margin: 0 }}>
                        {meta.label}
                      </p>
                    </div>
                    <p style={{ fontSize: 11, color: 'rgba(240,253,244,0.45)', margin: 0 }}>
                      {meta.description}
                    </p>
                  </div>
                  {connecting
                    ? <RefreshCw size={15} color={meta.color} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                    : <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 17, flexShrink: 0 }}>›</span>
                  }
                </button>
              );
            })}

            {/* KAI Wallet coming soon */}
            <KaiWalletTile />

            {(error || hashPackError) && (
              <div style={{
                padding: '10px 13px', borderRadius: 10, fontSize: 12, color: '#f87171',
                background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)',
              }}>
                <p style={{ fontWeight: 700, margin: '0 0 3px' }}>Connection Error</p>
                <p style={{ margin: '0 0 6px', fontSize: 11 }}>{hashPackError || error?.message}</p>
                <button
                  onClick={async () => {
                    setHashPackError(null);
                    reset();
                    try {
                      await disconnectHashPack();
                    } catch { /* ignore */ }
                  }}
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: '#22c55e', fontSize: 11, fontWeight: 700,
                  }}
                >
                  Reset Session & Retry →
                </button>
              </div>
            )}

            <p style={{
              fontSize: 10, textAlign: 'center', color: 'rgba(255,255,255,0.25)',
              lineHeight: 1.5, marginTop: 2,
            }}>
              HashPack = native Hedera · MetaMask = Hedera JSON-RPC relay
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── SVG Icons ─────────────────────────────────────────────────────────────── */

function HashPackIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 40 40" fill="none">
      <rect x="3" y="3" width="34" height="34" rx="10" fill="#1a365d" stroke="#63b3ed" strokeWidth="1.5"/>
      <path d="M11 12 L11 28 M11 20 L21 20 M21 12 L21 28"
            stroke="#63b3ed" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M24 20 L29 20" stroke="#90cdf4" strokeWidth="2.5" strokeLinecap="round"/>
      <circle cx="29" cy="20" r="2.5" fill="#63b3ed"/>
    </svg>
  );
}

function MetaMaskIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 318 318" fill="none">
      <path d="M274.1 35.5l-99.7 73.9 18.4-43.6 81.3-30.3z" fill="#E2761B" stroke="#E2761B" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M44.4 35.5l98.9 74.5-17.6-44.2L44.4 35.5z" fill="#E4761B" stroke="#E4761B" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M238.3 206.8l-26.5 40.6 56.7 15.6 16.3-55.3-46.5-.9z" fill="#E4761B" stroke="#E4761B"/>
      <path d="M33.9 207.7l16.2 55.3 56.7-15.6-26.5-40.6-46.4.9z" fill="#E4761B" stroke="#E4761B"/>
      <path d="M103.6 138.2l-15.8 23.9 56.3 2.5-2-60.5-38.5 34.1z" fill="#E4761B" stroke="#E4761B"/>
      <path d="M214.9 138.2l-39-34.7-1.3 61.1 56.2-2.5-15.9-23.9z" fill="#E4761B" stroke="#E4761B"/>
      <path d="M100.3 247.4l33.8-16.5-29.2-22.8-4.6 39.3z" fill="#E4761B" stroke="#E4761B"/>
      <path d="M184.4 230.9l33.9 16.5-4.7-39.3-29.2 22.8z" fill="#E4761B" stroke="#E4761B"/>
    </svg>
  );
}

function WalletConnectGenericIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 40 40" fill="none">
      <rect x="3" y="3" width="34" height="34" rx="10" fill="#1e293b" stroke="#3b82f6" strokeWidth="1.5"/>
      <path d="M12 16 C16 12 24 12 28 16 L23 21 C21 19 19 19 17 21 Z" fill="#3b82f6" />
      <circle cx="20" cy="25" r="3" fill="#60a5fa" />
    </svg>
  );
}

function HederaIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 40 40" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="20" cy="20" r="18" fill="rgba(99,179,237,0.15)" stroke="#63b3ed" strokeWidth="1.5"/>
      <text x="50%" y="55%" dominantBaseline="middle" textAnchor="middle" fill="#63b3ed" fontSize="20" fontWeight="bold">ℏ</text>
    </svg>
  );
}

function KaiIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 40 40" fill="none">
      <path d="M20 4 L36 12 L36 28 L20 36 L4 28 L4 12 Z" fill="#15803d" stroke="#22c55e" strokeWidth="1.5"/>
      <path d="M14 14 L20 20 L14 26" stroke="#86efac" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M22 14 L26 20 L22 26" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
