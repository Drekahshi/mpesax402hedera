/**
 * Single source of truth for all on-chain KAI addresses in the frontend.
 * Delegates to the deploy-written JSON files (deployedAddresses.json for
 * tokens, defiAddresses.json for vaults/AMM/pools, agentInfra.json for
 * the registry/escrow + agents). If the frontend ports these mirrors
 * are missing, fall back to the root-level JSON files.
 */

import deployed from './deployedAddresses.json';
import defi from './defiAddresses.json';
import agentInfra from './agentInfra.json';
import airdrop from './airdropAddresses.json';

type Hex = `0x${string}`;

interface DeployedFile {
  tokens?: Record<string, string>;
  explorerBase?: string;
  deployer?: string | null;
}
interface DefiFile {
  amm?: { address?: string };
  vaults?: Record<string, { address?: string; asset?: string }>;
}
interface AgentInfraFile {
  contracts?: {
    KaiAgentRegistry?: { address?: string };
    KaiEscrow?: { address?: string };
  };
  treasury?: string;
}
interface AirdropFile {
  contract?: { address?: string | null };
}

const d = deployed as DeployedFile;
const f = defi as DefiFile;
const a = agentInfra as AgentInfraFile;
const ai = airdrop as AirdropFile;

const isAddr = (v?: string | null): v is Hex =>
  !!v && /^0x[a-fA-F0-9]{40}$/.test(v) && !/^0x0+$/.test(v);

export const EXPLORER_BASE = d.explorerBase || 'https://sepolia.etherscan.io';

export const DEPLOYER = isAddr(d.deployer) ? d.deployer : null;

export const TOKENS: Record<string, Hex> = Object.fromEntries(
  Object.entries(d.tokens ?? {}).filter(([, v]) => isAddr(v)),
) as Record<string, Hex>;

export const AMM_ADDRESS = isAddr(f.amm?.address) ? f.amm.address! : null;

export const VAULT_ADDRESSES: Record<string, Hex> = Object.fromEntries(
  Object.entries(f.vaults ?? {}).filter(([, v]) => isAddr(v?.address)),
) as Record<string, Hex>;

export const REGISTRY_ADDRESS = isAddr(a.contracts?.KaiAgentRegistry?.address)
  ? a.contracts!.KaiAgentRegistry!.address!
  : null;

export const ESCROW_ADDRESS = isAddr(a.contracts?.KaiEscrow?.address)
  ? a.contracts!.KaiEscrow!.address!
  : null;

export const TREASURY = isAddr(a.treasury) ? a.treasury! : null;

export const AIRDROP_VAULT_ADDRESS = isAddr(ai.contract?.address)
  ? ai.contract!.address!
  : null;

export const walletAddress = (envValue?: string): Hex | null => {
  if (isAddr(envValue)) return envValue as Hex;
  return DEPLOYER;
};
