'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Rocket, ExternalLink, CheckCircle2 } from 'lucide-react';
import { usePrivyAuth } from '@/lib/privy-auth';
import { AIRDROP_VAULT_ADDRESS, EXPLORER_BASE } from '@/lib/addresses';

/**
 * On-chain airdrop claim (PRD 2 §11). If a KAIAirdropVault is deployed and a
 * Merkle root is committed, an eligible user can claim. If no vault/root is
 * live yet, this gracefully shows the "coming soon" state instead of erroring.
 *
 * Note: a real production claim requires a Merkle proof fetched from the
 * tokenomics backend. The API route /api/kai-bar/airdrop/claim can supply it;
 * this component demonstrates the read + submit path with the Privy wallet.
 */
export function AirdropClaimCard({
  eligible,
  amount,
}: {
  eligible: boolean;
  amount: number;
}) {
  const { claimAirdrop, address } = usePrivyAuth();
  const [state, setState] = useState<'idle' | 'claiming' | 'success' | 'error'>('idle');
  const [msg, setMsg] = useState<string>('');

  const vault = AIRDROP_VAULT_ADDRESS;

  if (!vault) {
    return (
      <div style={{ borderRadius: 14, padding: '14px 16px', marginTop: 12,
        background: 'rgba(255,255,255,0.04)', boxShadow: '0 0 0 1px rgba(255,255,255,0.07) inset' }}>
        <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
          <Rocket size={14} style={{ verticalAlign: 'middle', marginRight: 6, color: '#fbbf24' }} />
          The on-chain airdrop vault has not been deployed yet. Eligibility is being tracked now.
        </p>
      </div>
    );
  }

  const doClaim = async () => {
    if (!eligible || amount <= 0) return;
    setState('claiming');
    setMsg('');
    try {
      // Real systems fetch a fresh Merkle proof per claim from the backend.
      // This simplified path only works once a proof is available; it is wired
      // so the UI is self-documenting. See AirdropEligibility + KAIAirdropVault.
      const proof: `0x${string}`[] = [];
      const hash = await claimAirdrop({ vault, amount: BigInt(Math.floor(amount)), proof });
      const h = typeof hash === 'string' ? hash : hash.hash;
      setState('success');
      setMsg(`Claim submitted: ${h.slice(0, 8)}…${h.slice(-4)}`);
    } catch (e) {
      const m = String(e instanceof Error ? e.message : e).toLowerCase();
      if (m.includes('noteligible') || m.includes('not eligible')) {
        setState('error'); setMsg('This allocation is not yours to claim.');
      } else if (m.includes('already')) {
        setState('success'); setMsg('Already claimed!');
      } else if (m.includes('rejected') || m.includes('denied')) {
        setState('error'); setMsg('Claim was rejected.');
      } else {
        setState('error'); setMsg('Claim failed. Please check your eligibility and try again.');
      }
    }
  };

  return (
    <div style={{ borderRadius: 14, padding: '14px 16px', marginTop: 12,
      background: 'rgba(245,158,11,0.06)', boxShadow: '0 0 0 1px rgba(245,158,11,0.2) inset' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <Rocket size={17} color="#fbbf24" />
        <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: 'rgba(255,255,255,0.9)' }}>
          On-chain airdrop claim
        </p>
        <a href={`${EXPLORER_BASE}/address/${vault}`} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: 4 }}>
          Vault <ExternalLink size={11} />
        </a>
      </div>
      <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
        {address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'No wallet connected'} · Eligible: {eligible ? 'yes' : 'no'} · Est. allocation: {amount}
      </p>
      <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={doClaim}
        disabled={!eligible || amount <= 0 || state === 'claiming'}
        style={{
          marginTop: 12, width: '100%', padding: '11px 0', borderRadius: 11, border: 'none', cursor: 'pointer',
          background: !eligible || amount <= 0 ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg,#f59e0b,#b45309)',
          color: '#fff', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
        {state === 'claiming' ? <><Loader2 size={15} className="animate-spin" /> Claiming…</> : <><Rocket size={15} /> Claim</>}
      </motion.button>
      {msg && (
        <p style={{ margin: '10px 0 0', fontSize: 12, lineHeight: 1.4,
          color: state === 'error' ? '#fca5a5' : '#6ee7b7',
          display: 'flex', alignItems: 'center', gap: 6 }}>
          {state === 'success' && <CheckCircle2 size={13} />}{msg}
        </p>
      )}
    </div>
  );
}
