'use client';

import { useState } from 'react';
import { useAccount, useWriteContract, useSwitchChain, usePublicClient } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { parseUnits, maxUint256 } from 'viem';
import { ERC20_ABI } from '@/lib/erc20abi';
import { 
  Bot, ShieldCheck, ArrowRight, ExternalLink, Loader2, CheckCircle2, AlertTriangle, Cpu
} from 'lucide-react';

export interface AgentProposal {
  id?: string;
  agentName: string;
  actionType: 'TRANSFER' | 'APPROVE_STAKE' | 'VAULT_DEPOSIT' | 'SWAP' | 'POLICY_MINT';
  title: string;
  description: string;
  targetContract?: `0x${string}`;
  recipientAddress?: `0x${string}`;
  amount: string;
  tokenSymbol: string;
  tokenAddress?: `0x${string}`;
  estimatedGasKes?: number;
  projectedApy?: string;
}

interface AgentProposalCardProps {
  proposal: AgentProposal;
  onSuccess?: (txHash: string) => void;
}

export default function AgentProposalCard({ proposal, onSuccess }: AgentProposalCardProps) {
  const { address, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const [executing, setExecuting] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleExecuteProposal = async () => {
    if (!isConnected || !address) {
      setErrorMsg('Please connect your wallet first to approve this proposal.');
      return;
    }

    setExecuting(true);
    setErrorMsg(null);
    setStatusMsg('Switching to Sepolia / Hedera Testnet network…');

    try {
      // 1. Ensure correct chain
      await switchChainAsync({ chainId: sepolia.id });

      let hash: `0x${string}`;

      if (proposal.actionType === 'TRANSFER' && proposal.tokenAddress && proposal.recipientAddress) {
        setStatusMsg(`Signing transfer of ${proposal.amount} ${proposal.tokenSymbol}…`);
        hash = await writeContractAsync({
          address: proposal.tokenAddress,
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [proposal.recipientAddress, parseUnits(proposal.amount, 18)],
          chainId: sepolia.id,
        });
      } else if (proposal.actionType === 'APPROVE_STAKE' && proposal.tokenAddress && proposal.targetContract) {
        setStatusMsg(`Approving ${proposal.tokenSymbol} for Vault contract…`);
        hash = await writeContractAsync({
          address: proposal.tokenAddress,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [proposal.targetContract, parseUnits(proposal.amount, 18)],
          chainId: sepolia.id,
        });
      } else if (proposal.tokenAddress && (proposal.targetContract || proposal.recipientAddress)) {
        // Default token operation
        const recipient = proposal.targetContract || proposal.recipientAddress!;
        setStatusMsg(`Executing ${proposal.actionType} on-chain…`);
        hash = await writeContractAsync({
          address: proposal.tokenAddress,
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [recipient, parseUnits(proposal.amount, 18)],
          chainId: sepolia.id,
        });
      } else {
        throw new Error('Contract address or parameters missing for on-chain execution.');
      }

      setStatusMsg('Waiting for transaction confirmation on Ethereum & Hedera…');
      await publicClient?.waitForTransactionReceipt({ hash });

      setTxHash(hash);
      setStatusMsg('Transaction successfully confirmed!');
      if (onSuccess) onSuccess(hash);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Execution failed';
      console.error('[AgentProposalCard]', msg);
      setErrorMsg(msg.length > 120 ? `${msg.slice(0, 120)}…` : msg);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="my-4 rounded-2xl border border-gold-base/30 bg-gradient-to-b from-[#181820]/90 to-[#0e0e14]/95 p-5 shadow-2xl backdrop-blur-xl relative overflow-hidden">
      {/* Glow background highlight */}
      <div className="absolute -top-12 -right-12 w-32 h-32 bg-gold-base/10 rounded-full blur-2xl pointer-events-none" />

      {/* Card Header */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gold-base/20 border border-gold-base/40 flex items-center justify-center text-gold-base">
            <Cpu size={18} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold tracking-wider text-gold-base uppercase">
                {proposal.agentName}
              </span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded font-mono">
                AGENT PROPOSAL
              </span>
            </div>
            <p className="text-xs text-white/50">{proposal.title}</p>
          </div>
        </div>

        <div className="flex items-center gap-1 text-[11px] text-white/40 bg-white/5 px-2.5 py-1 rounded-full border border-white/10">
          <ShieldCheck size={13} className="text-gold-base" />
          <span>Requires Approval</span>
        </div>
      </div>

      {/* Proposal Body */}
      <div className="py-4 space-y-3">
        <p className="text-sm text-white/80 leading-relaxed">
          {proposal.description}
        </p>

        {/* Action Details Grid */}
        <div className="grid grid-cols-2 gap-2 bg-black/40 rounded-xl p-3 border border-white/5 font-mono text-xs">
          <div>
            <span className="text-white/40 text-[10px] block">AMOUNT & TOKEN</span>
            <span className="text-white font-bold text-sm text-emerald-400">
              {proposal.amount} {proposal.tokenSymbol}
            </span>
          </div>
          {proposal.projectedApy && (
            <div>
              <span className="text-white/40 text-[10px] block">PROJECTED APY</span>
              <span className="text-gold-base font-bold text-sm">
                {proposal.projectedApy}
              </span>
            </div>
          )}
          {proposal.recipientAddress && (
            <div className="col-span-2 pt-1 border-t border-white/5">
              <span className="text-white/40 text-[10px] block">RECIPIENT / TARGET</span>
              <span className="text-white/70 text-[11px] truncate block">
                {proposal.recipientAddress}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Execution / Status Messages */}
      {txHash ? (
        <div className="mt-3 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />
            <span>Execution confirmed on-chain!</span>
          </div>
          <a
            href={`https://sepolia.etherscan.io/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 font-bold underline hover:text-white transition-colors"
          >
            Etherscan <ExternalLink size={12} />
          </a>
        </div>
      ) : errorMsg ? (
        <div className="mt-3 p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-xs text-red-300 flex items-start gap-2">
          <AlertTriangle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      ) : statusMsg ? (
        <div className="mt-3 p-3 rounded-xl bg-gold-base/10 border border-gold-base/20 text-xs text-gold-base flex items-center gap-2 font-mono">
          <Loader2 size={15} className="animate-spin text-gold-base flex-shrink-0" />
          <span>{statusMsg}</span>
        </div>
      ) : null}

      {/* Action Footer Button */}
      {!txHash && (
        <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between">
          <span className="text-[11px] text-white/40 flex items-center gap-1">
            <ShieldCheck size={12} className="text-emerald-400" />
            No transaction occurs until you approve
          </span>

          <button
            onClick={handleExecuteProposal}
            disabled={executing}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-black bg-gradient-to-r from-gold-base to-amber-400 hover:from-amber-300 hover:to-gold-base transition-all duration-200 shadow-lg shadow-gold-base/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {executing ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Processing…
              </>
            ) : (
              <>
                Approve & Execute <ArrowRight size={14} />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
