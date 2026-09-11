/**
 * deploy-agent-infra.ts
 * Deploys KaiAgentRegistry + KaiEscrow to Sepolia and registers all 8 KAI agents.
 *
 * Usage:
 *   npx hardhat run scripts/deploy-agent-infra.ts --network sepolia
 *
 * Writes:
 *   agent-infra.json              (project root)
 *   frontend/src/lib/agentInfra.json
 *   ai-agent/.env  (appends KAI_AGENT_REGISTRY, KAI_ESCROW_ADDRESS)
 *
 * Prerequisites:
 *   .env must have PRIVATE_KEY and SEPOLIA_RPC_URL
 *   Run deploy.ts first to have the ecosystem token addresses.
 */

import { writeFile, readFile, appendFile } from "node:fs/promises";
import { existsSync }                       from "node:fs";
import { resolve, dirname }                 from "node:path";
import { fileURLToPath }                    from "node:url";
import { network }                          from "hardhat";
import { parseEther, formatEther }          from "viem";

const __dirname = dirname(fileURLToPath(import.meta.url));

const { viem }     = await network.create();
const publicClient = await viem.getPublicClient();
const [deployer]   = await viem.getWalletClients();

const networkName = publicClient.chain?.name ?? network.name;
const chainId     = publicClient.chain?.id   ?? 0;
const explorer    = chainId === 11155111
  ? "https://sepolia.etherscan.io"
  : "https://etherscan.io";

console.log("─────────────────────────────────────────────────");
console.log(`Network  : ${networkName} (chainId ${chainId})`);
console.log(`Deployer : ${deployer.account.address}`);

const balance = await publicClient.getBalance({ address: deployer.account.address });
console.log(`Balance  : ${formatEther(balance)} ETH`);

if (network.name === "sepolia" && balance < parseEther("0.15")) {
  throw new Error(
    `Low balance (${formatEther(balance)} ETH). Need ≥0.15 ETH. ` +
    "Top up at https://sepoliafaucet.com",
  );
}
console.log("─────────────────────────────────────────────────\n");

// ─── 1. Deploy KaiAgentRegistry ───────────────────────────────────────────────
console.log("[1/3] Deploying KaiAgentRegistry…");
const registry = await viem.deployContract("KaiAgentRegistry", []);
console.log(`  ✓ KaiAgentRegistry : ${registry.address}`);
console.log(`    ${explorer}/address/${registry.address}`);

// ─── 2. Deploy KaiEscrow ──────────────────────────────────────────────────────
console.log("\n[2/3] Deploying KaiEscrow…");
const treasury = deployer.account.address;   // deployer = initial treasury
const escrow   = await viem.deployContract("KaiEscrow", [
  registry.address,
  treasury,
]);
console.log(`  ✓ KaiEscrow        : ${escrow.address}`);
console.log(`    ${explorer}/address/${escrow.address}`);

// ─── 3. Register all 8 KAI agents ────────────────────────────────────────────
console.log("\n[3/3] Registering KAI agents…");

// Deterministic addresses derived from agent names
function deterministicAddress(seed: string): `0x${string}` {
  const encoder = new TextEncoder();
  const data    = encoder.encode(seed);
  let hash = 0n;
  for (const byte of data) {
    hash = (hash * 31n + BigInt(byte)) % (2n ** 160n);
  }
  return `0x${hash.toString(16).padStart(40, "0")}` as `0x${string}`;
}

const AGENTS = [
  {
    name:    "tx_analyst",
    label:   "KAI Transaction Analyst",
    desc:    "Explains Sepolia EVM transactions in plain English",
    url:     "http://127.0.0.1:8000",
    caps:    '{"can_analyse_transactions":true,"max_payment_usd":0.01,"daily_budget_usd":1.0}',
    daily:   parseEther("0.01"),
    perTx:   parseEther("0.001"),
  },
  {
    name:    "portfolio_health",
    label:   "KAI Portfolio Health Agent",
    desc:    "Analyses wallet holdings and vault positions",
    url:     "http://127.0.0.1:8000",
    caps:    '{"can_analyse_transactions":true,"max_payment_usd":0.02,"daily_budget_usd":2.0}',
    daily:   parseEther("0.02"),
    perTx:   parseEther("0.002"),
  },
  {
    name:    "contract_auditor",
    label:   "KAI Contract Auditor",
    desc:    "Security audits Solidity smart contracts",
    url:     "http://127.0.0.1:8000",
    caps:    '{"can_audit_contracts":true,"max_payment_usd":0.05,"daily_budget_usd":5.0}',
    daily:   parseEther("0.05"),
    perTx:   parseEther("0.005"),
  },
  {
    name:    "dao_drafter",
    label:   "KAI DAO Proposal Drafter",
    desc:    "Drafts formal KAI DAO governance proposals",
    url:     "http://127.0.0.1:8000",
    caps:    '{"can_draft_proposals":true,"max_payment_usd":0.02,"daily_budget_usd":2.0}',
    daily:   parseEther("0.02"),
    perTx:   parseEther("0.002"),
  },
  {
    name:    "commodity_pricing",
    label:   "KAI Commodity Pricing Agent",
    desc:    "Community commodity market analysis",
    url:     "http://127.0.0.1:8000",
    caps:    '{"max_payment_usd":0.01,"daily_budget_usd":1.0}',
    daily:   parseEther("0.01"),
    perTx:   parseEther("0.001"),
  },
  {
    name:    "policy_recommender",
    label:   "KAI Policy Recommender",
    desc:    "Personalised KAI product recommendations",
    url:     "http://127.0.0.1:8000",
    caps:    '{"max_payment_usd":0.02,"daily_budget_usd":2.0}',
    daily:   parseEther("0.02"),
    perTx:   parseEther("0.002"),
  },
  {
    name:    "code_gen",
    label:   "KAI Solidity Code Generator",
    desc:    "Generates and self-corrects Solidity contracts via Hardhat compile loop",
    url:     "http://127.0.0.1:8000",
    caps:    '{"can_audit_contracts":true,"max_payment_usd":0.10,"daily_budget_usd":10.0}',
    daily:   parseEther("0.10"),
    perTx:   parseEther("0.01"),
  },
  {
    name:    "doc_summarizer",
    label:   "KAI Document Summarizer",
    desc:    "Document Q&A via local RAG and ChromaDB",
    url:     "http://127.0.0.1:8000",
    caps:    '{"max_payment_usd":0.01,"daily_budget_usd":1.0}',
    daily:   parseEther("0.01"),
    perTx:   parseEther("0.001"),
  },
] as const;

const registeredAgents: Record<string, { address: string; did: string; tx: string }> = {};

for (const agent of AGENTS) {
  const agentAddr = deterministicAddress(agent.name);
  try {
    const txHash = await registry.write.registerAgent([
      agentAddr,
      agent.label,
      agent.desc,
      `${agent.url}/agents/${agent.name.replace("_", "/")}`,
      agent.caps,
      agent.daily,
      agent.perTx,
    ]);

    const did = `did:kai:${chainId}:${agentAddr.toLowerCase()}`;
    registeredAgents[agent.name] = { address: agentAddr, did, tx: txHash };
    console.log(`  ✓ ${agent.label}`);
    console.log(`    DID  : ${did}`);
    console.log(`    Addr : ${agentAddr}`);
  } catch (err: any) {
    console.warn(`  ⚠ ${agent.label}: ${err.message?.slice(0, 80)}`);
    const did = `did:kai:${chainId}:${agentAddr.toLowerCase()}`;
    registeredAgents[agent.name] = { address: agentAddr, did, tx: "" };
  }
}

// ─── 4. Write output files ────────────────────────────────────────────────────
const payload = {
  network:   networkName,
  chainId,
  deployedAt: new Date().toISOString(),
  deployer:  deployer.account.address,
  treasury,
  explorer,
  contracts: {
    KaiAgentRegistry: {
      address:  registry.address,
      explorer: `${explorer}/address/${registry.address}`,
    },
    KaiEscrow: {
      address:  escrow.address,
      explorer: `${explorer}/address/${escrow.address}`,
    },
  },
  agents: registeredAgents,
};

const rootOut     = resolve(__dirname, "..", "agent-infra.json");
const frontendOut = resolve(__dirname, "..", "frontend", "src", "lib", "agentInfra.json");
const envPath     = resolve(__dirname, "..", "ai-agent", ".env");

await writeFile(rootOut,     `${JSON.stringify(payload, null, 2)}\n`);
await writeFile(frontendOut, `${JSON.stringify(payload, null, 2)}\n`);

// Append/update the ai-agent .env
const envAdditions = `\n# ── Auto-written by deploy-agent-infra.ts ──\nKAI_AGENT_REGISTRY=${registry.address}\nKAI_ESCROW_ADDRESS=${escrow.address}\nCHAIN_ID=${chainId}\n`;
const envPath2 = envPath;
if (existsSync(envPath2)) {
  const existing = await readFile(envPath2, "utf8");
  if (!existing.includes("KAI_AGENT_REGISTRY")) {
    await appendFile(envPath2, envAdditions);
    console.log("\n  ✓ Appended KAI_AGENT_REGISTRY + KAI_ESCROW_ADDRESS to ai-agent/.env");
  } else {
    console.log("\n  ℹ  ai-agent/.env already has registry addresses — not modified.");
  }
} else {
  await writeFile(envPath2, envAdditions.trim() + "\n");
  console.log("\n  ✓ Created ai-agent/.env with registry addresses");
}

console.log("\n─────────────────────────────────────────────────");
console.log("✓ agent-infra.json written (root + frontend/src/lib/)");
console.log(`  Registry : ${registry.address}`);
console.log(`  Escrow   : ${escrow.address}`);
console.log(`  Agents   : ${Object.keys(registeredAgents).length} registered`);
console.log("\nNext steps:");
console.log("  1. Restart the AI agent server to pick up new env vars");
console.log("  2. Open http://127.0.0.1:8000/agents/identity to see all DID documents");
console.log("  3. Open http://127.0.0.1:8000/agents/x402/info to see payment config");
console.log("─────────────────────────────────────────────────\n");
