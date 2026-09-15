'use client';

/**
 * HederaTxConfirmation.tsx
 * Shared Hedera transaction confirmation component.
 *
 * PRD requirement: Every successful on-chain action must provide a
 * confirmation screen showing action, amount, network, TX ID, and HashScan link.
 * Failed transactions must show reason and confirm no funds were moved.
 */

import React from 'react';
import { CheckCircle2, XCircle, ExternalLink, Copy, X } from 'lucide-react';

export interface HederaTxConfirmationProps {
  /** Whether the transaction succeeded */
  success: boolean;
  /** Hedera transaction ID (e.g. 0.0.xxxxx@xxxxxxxxx) */
  transactionId?: string;
  /** HashScan or Mirror Node explorer URL */
  explorerUrl?: string;
  /** Optional EVM transaction hash */
  evmTxHash?: string;
  /** Optional EVM contract HashScan URL */
  evmExplorerUrl?: string;
  /** Action description e.g. "Swap HBAR → Y Token" */
  action: string;
  /** Input amount string e.g. "1 HBAR" */
  inputAmount?: string;
  /** Output amount string e.g. "10 NVR" */
  outputAmount?: string;
  /** Network name e.g. "Hedera Testnet" */
  network?: string;
  /** Error reason when success=false */
  errorReason?: string;
  /** Called when user dismisses the confirmation */
  onClose?: () => void;
  /** Optional inline mode (no overlay backdrop) */
  inline?: boolean;
}

function copyToClipboard(text: string) {
  try {
    navigator.clipboard.writeText(text);
  } catch {
    // fallback — silently fail if clipboard unavailable
  }
}

function shortTxId(txId: string): string {
  if (txId.length <= 24) return txId;
  return `${txId.slice(0, 14)}…${txId.slice(-8)}`;
}

export default function HederaTxConfirmation({
  success,
  transactionId,
  explorerUrl,
  evmTxHash,
  evmExplorerUrl,
  action,
  inputAmount,
  outputAmount,
  network = 'Hedera Testnet',
  errorReason,
  onClose,
  inline = false,
}: HederaTxConfirmationProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    if (!transactionId) return;
    copyToClipboard(transactionId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const card = (
    <div
      style={{
        background: 'rgba(10, 12, 20, 0.96)',
        border: `1px solid ${success ? 'rgba(34, 197, 94, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
        borderRadius: 20,
        padding: '28px 24px',
        maxWidth: 400,
        width: '100%',
        boxShadow: `0 20px 60px ${success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'}`,
        position: 'relative',
      }}
    >
      {/* Close button */}
      {onClose && (
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            background: 'rgba(255,255,255,0.06)',
            border: 'none',
            borderRadius: '50%',
            width: 30,
            height: 30,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'rgba(255,255,255,0.5)',
          }}
        >
          <X size={15} />
        </button>
      )}

      {/* Icon + Status */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 20 }}>
        {success ? (
          <CheckCircle2 size={48} color="#22c55e" strokeWidth={1.5} />
        ) : (
          <XCircle size={48} color="#ef4444" strokeWidth={1.5} />
        )}
        <h2
          style={{
            margin: '12px 0 4px',
            fontSize: 18,
            fontWeight: 800,
            color: success ? '#22c55e' : '#ef4444',
            letterSpacing: '-0.01em',
          }}
        >
          {success ? 'Transaction Successful' : 'Transaction Failed'}
        </h2>
        <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
          {network}
        </p>
      </div>

      {/* Details rows */}
      <div
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 14,
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          marginBottom: 16,
        }}
      >
        <Row label="Action" value={action} />

        {inputAmount && outputAmount && (
          <Row
            label="Amount"
            value={`${inputAmount} → ${outputAmount}`}
            valueColor="#34d399"
          />
        )}

        {inputAmount && !outputAmount && (
          <Row label="Amount" value={inputAmount} />
        )}

        {transactionId && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
              Transaction ID
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  fontSize: 11,
                  color: '#60a5fa',
                  fontFamily: 'monospace',
                  wordBreak: 'break-all',
                  textAlign: 'right',
                  maxWidth: 180,
                }}
              >
                {shortTxId(transactionId)}
              </span>
              <button
                onClick={handleCopy}
                title="Copy TX ID"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 2,
                  color: copied ? '#22c55e' : 'rgba(255,255,255,0.4)',
                  flexShrink: 0,
                }}
              >
                <Copy size={12} />
              </button>
            </div>
          </div>
        )}

        <Row
          label="Status"
          value={success ? 'Confirmed' : 'Failed'}
          valueColor={success ? '#22c55e' : '#ef4444'}
        />
      </div>

      {/* Error reason */}
      {!success && errorReason && (
        <div
          style={{
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 10,
            padding: '10px 14px',
            marginBottom: 16,
            fontSize: 12,
            color: '#fca5a5',
          }}
        >
          <strong>Reason:</strong> {errorReason}
          <p style={{ margin: '6px 0 0', color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>
            No funds were moved.
          </p>
        </div>
      )}

      {/* HashScan link */}
      {explorerUrl && success && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '11px 16px',
            background: 'rgba(34,197,94,0.1)',
            border: '1px solid rgba(34,197,94,0.25)',
            borderRadius: 12,
            color: '#34d399',
            fontWeight: 700,
            fontSize: 13,
            textDecoration: 'none',
            transition: 'all 0.2s',
          }}
        >
          View Token Transfer on HashScan <ExternalLink size={13} />
        </a>
      )}

      {/* EVM Contract HashScan link */}
      {evmExplorerUrl && success && (
        <a
          href={evmExplorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '11px 16px',
            marginTop: 8,
            background: 'rgba(99,102,241,0.12)',
            border: '1px solid rgba(99,102,241,0.3)',
            borderRadius: 12,
            color: '#818cf8',
            fontWeight: 700,
            fontSize: 13,
            textDecoration: 'none',
            transition: 'all 0.2s',
          }}
        >
          View EVM Vault Tx on HashScan (0.001 HBAR Fee) <ExternalLink size={13} />
        </a>
      )}

      {/* Dismiss button for failures */}
      {!success && onClose && (
        <button
          onClick={onClose}
          style={{
            width: '100%',
            padding: '11px 16px',
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 12,
            color: '#fca5a5',
            fontWeight: 700,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Dismiss
        </button>
      )}
    </div>
  );

  if (inline) return card;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 20,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      {card}
    </div>
  );
}

function Row({
  label,
  value,
  valueColor = '#ffffff',
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
        {label}
      </span>
      <span style={{ fontSize: 13, color: valueColor, fontWeight: 700, textAlign: 'right' }}>
        {value}
      </span>
    </div>
  );
}
