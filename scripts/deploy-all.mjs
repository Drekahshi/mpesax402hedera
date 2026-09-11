/**
 * deploy-all-sepolia.mjs
 * Deploys all undeployed contracts to Sepolia / Hedera Testnet using ethers.js directly.
 * Uses pre-compiled bytecode from artifacts/ — no Hardhat compile needed.
 *
 * Usage:
 *   node scripts/deploy-all-sepolia.mjs
 *
 * Reads: .env (PRIVATE_KEY, SEPOLIA_RPC_URL)
 * Writes: defi-addresses.json, agent-infra.json and the frontend JSON files
 */

import { ethers } from "ethers";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, "..");
dotenv.config({ path: resolve(ROOT, ".env") });

// ── RPC + wallet ──────────────────────────────────────────────────────────────
const RPC_URL = process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org";
let   PK      = (process.env.PRIVATE_KEY || "").trim().replace(/^["']|["']$/g, "");
if (PK && !PK.startsWith("0x")) PK = "0x" + PK;
if (!PK || PK.length !== 66) {
  console.error("❌ PRIVATE_KEY not set or invalid in .env");
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer   = new ethers.Wallet(PK, provider);
const EXPLORER = "https://sepolia.etherscan.io";

console.log("─────────────────────────────────────────────────");
console.log(`Deployer : ${signer.address}`);
const balance = await provider.getBalance(signer.address);
console.log(`Balance  : ${ethers.formatEther(balance)} ETH`);
if (balance < ethers.parseEther("0.3")) {
  console.warn("⚠️  Low balance — recommended ≥0.3 ETH for full deployment");
}
console.log("─────────────────────────────────────────────────\n");

// ── Load artifact ─────────────────────────────────────────────────────────────
function loadArtifact(contractName) {
  const paths = [
    resolve(ROOT, "artifacts", "contracts", `${contractName}.sol`, `${contractName}.json`),
  ];
  for (const p of paths) {
    if (existsSync(p)) {
      const art = JSON.parse(readFileSync(p, "utf8"));
      return { abi: art.abi, bytecode: art.bytecode };
    }
  }
  throw new Error(`Artifact not found for ${contractName}`);
}

// ── Deploy helper ─────────────────────────────────────────────────────────────
async function deploy(name, args = []) {
  console.log(`Deploying ${name}…`);
  const { abi, bytecode } = loadArtifact(name);
  const factory  = new ethers.ContractFactory(abi, bytecode, signer);
  const contract = await factory.deploy(...args, {
    gasLimit: 3_000_000,
    gasPrice: ethers.parseUnits("26", "gwei"),
  });
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`  ✓ ${name} : ${address}`);
  console.log(`    ${EXPLORER}/address/${address}`);
  return { address, contract, abi };
}

// ── Load existing deployments ─────────────────────────────────────────────────
const tokenFile = resolve(ROOT, "frontend", "src", "lib", "deployedAddresses.json");
if (!existsSync(tokenFile)) {
  console.error("❌ deployedAddresses.json not found — ERC-20 tokens already deployed, file should exist");
  process.exit(1);
}
const { tokens: T } = JSON.parse(readFileSync(tokenFile, "utf8"));
console.log("✓ Loaded token addresses:", Object.keys(T).join(", "));
console.log();

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 1 — DeFi: KaiAMM + 6 KaiVault + 3 KaiPool
// ═══════════════════════════════════════════════════════════════════════════════
console.log("═══ STEP 1: DeFi Contracts ═══\n");

// 1.1 KaiAMM
const { address: ammAddr, contract: amm } = await deploy("KaiAMM");

// 1.2 KaiVault × 6
const VAULT_CONFIG = {
  NVR:    { apyBps: 1520 },
  yBOB:   { apyBps: 750  },
  YTOKEN: { apyBps: 1480 },
  YGOLD:  { apyBps: 1240 },
  GAMI:   { apyBps: 2200 },
  CENTS:  { apyBps: 650  },
};

const vaults = {};
for (const [sym, cfg] of Object.entries(VAULT_CONFIG)) {
  if (!T[sym]) { console.warn(`  ⚠  No address for ${sym} — skipping vault`); continue; }
  const { address } = await deploy("KaiVault", [T[sym], `KAI ${sym} Vault`, `kv${sym}`, cfg.apyBps]);
  vaults[sym] = { address, apyBps: cfg.apyBps, apyPct: `${(cfg.apyBps/100).toFixed(1)}%`, asset: T[sym],
                  explorer: `${EXPLORER}/address/${address}` };
}

// 1.3 KaiPool × 3 + register with AMM
const PAIRS = [["NVR","yBOB"], ["YTOKEN","YGOLD"], ["GAMI","CENTS"]];
const pools = [];

for (const [nameA, nameB] of PAIRS) {
  const addrA = T[nameA], addrB = T[nameB];
  if (!addrA || !addrB) { console.warn(`  ⚠  Skipping ${nameA}/${nameB}`); continue; }

  // Sort canonically
  const [t0, t1, n0, n1] = addrA.toLowerCase() < addrB.toLowerCase()
    ? [addrA, addrB, nameA, nameB]
    : [addrB, addrA, nameB, nameA];

  const { address: poolAddr } = await deploy("KaiPool", [t0, t1, `KAI LP ${n0}/${n1}`, `kLP-${n0}-${n1}`]);

  // Register in AMM
  process.stdout.write(`  Registering ${nameA}/${nameB} pool in AMM… `);
  const tx = await amm.registerPool(t0, t1, poolAddr, {
    gasLimit: 200_000,
    gasPrice: ethers.parseUnits("26", "gwei"),
  });
  await tx.wait();
  console.log("✓");

  pools.push({ pair: `${nameA}/${nameB}`, address: poolAddr, tokenA: addrA, tokenB: addrB,
               explorer: `${EXPLORER}/address/${poolAddr}` });
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 2 — Agent Infra: KaiAgentRegistry + KaiEscrow
// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══ STEP 2: Agent Infrastructure ═══\n");

const { address: registryAddr, contract: registry } = await deploy("KaiAgentRegistry");
const { address: escrowAddr }                        = await deploy("KaiEscrow", [registryAddr, signer.address]);

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 3 — Register 8 KAI agents in registry
// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══ STEP 3: Register KAI Agents ═══\n");

function deterministicAddress(seed) {
  let hash = 0n;
  for (const ch of seed) hash = (hash * 31n + BigInt(ch.charCodeAt(0))) % (2n ** 160n);
  return "0x" + hash.toString(16).padStart(40, "0");
}

const AGENTS = [
  { name: "tx_analyst",         label: "KAI Transaction Analyst",      desc: "Explains Sepolia transactions",        daily: ethers.parseEther("0.01"),  perTx: ethers.parseEther("0.001"), caps: '{"can_analyse_transactions":true}' },
  { name: "portfolio_health",   label: "KAI Portfolio Health Agent",   desc: "Wallet DeFi health reports",       daily: ethers.parseEther("0.02"),  perTx: ethers.parseEther("0.002"), caps: '{"can_analyse_transactions":true}' },
  { name: "contract_auditor",   label: "KAI Contract Auditor",         desc: "Solidity security audits",          daily: ethers.parseEther("0.05"),  perTx: ethers.parseEther("0.005"), caps: '{"can_audit_contracts":true}' },
  { name: "dao_drafter",        label: "KAI DAO Proposal Drafter",     desc: "Drafts governance proposals",      daily: ethers.parseEther("0.02"),  perTx: ethers.parseEther("0.002"), caps: '{"can_draft_proposals":true}' },
  { name: "commodity_pricing",  label: "KAI Commodity Pricing Agent",  desc: "Community commodity analysis",     daily: ethers.parseEther("0.01"),  perTx: ethers.parseEther("0.001"), caps: '{}' },
  { name: "policy_recommender", label: "KAI Policy Recommender",       desc: "KAI product recommendations",   daily: ethers.parseEther("0.02"),  perTx: ethers.parseEther("0.002"), caps: '{}' },
  { name: "code_gen",           label: "KAI Solidity Code Generator",  desc: "Generates Solidity contracts",     daily: ethers.parseEther("0.10"),  perTx: ethers.parseEther("0.01"),  caps: '{"can_audit_contracts":true}' },
  { name: "doc_summarizer",     label: "KAI Document Summarizer",      desc: "Document Q&A via RAG",             daily: ethers.parseEther("0.01"),  perTx: ethers.parseEther("0.001"), caps: '{}' },
];

const registeredAgents = {};
for (const agent of AGENTS) {
  const agentAddr = deterministicAddress(agent.name);
  process.stdout.write(`  Registering ${agent.label}… `);
  try {
    const tx = await registry.registerAgent(
      agentAddr, agent.label, agent.desc,
      `http://127.0.0.1:8000/agents/${agent.name.replace("_","/")}`,
      agent.caps, agent.daily, agent.perTx,
      { gasLimit: 500_000, gasPrice: ethers.parseUnits("26", "gwei") }
    );
    await tx.wait();
    console.log("✓");
  } catch (e) {
    console.log(`⚠️  ${e.message?.slice(0,60)}`);
  }
  registeredAgents[agent.name] = {
    address: agentAddr,
    did: `did:kai:11155111:${agentAddr.toLowerCase()}`,
    tx: "",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 4 — Write output files
// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══ STEP 4: Writing output files ═══\n");

const defiPayload = {
  network: "Sepolia / Hedera Testnet", chainId: 11155111,
  deployedAt: new Date().toISOString(),
  deployer: signer.address, explorerBase: EXPLORER,
  amm: { address: ammAddr, explorer: `${EXPLORER}/address/${ammAddr}` },
  vaults, pools,
};

const agentPayload = {
  network: "Sepolia / Hedera Testnet", chainId: 11155111,
  deployedAt: new Date().toISOString(),
  deployer: signer.address, treasury: signer.address, explorer: EXPLORER,
  contracts: {
    KaiAgentRegistry: { address: registryAddr, explorer: `${EXPLORER}/address/${registryAddr}` },
    KaiEscrow:        { address: escrowAddr,   explorer: `${EXPLORER}/address/${escrowAddr}` },
  },
  agents: registeredAgents,
};

const write = (path, data) => { writeFileSync(path, JSON.stringify(data, null, 2) + "\n"); console.log(`  ✓ ${path}`); };

write(resolve(ROOT, "defi-addresses.json"),                              defiPayload);
write(resolve(ROOT, "frontend", "src", "lib", "defiAddresses.json"), defiPayload);
write(resolve(ROOT, "agent-infra.json"),                                  agentPayload);
write(resolve(ROOT, "frontend", "src", "lib", "agentInfra.json"),   agentPayload);

// Append to ai-agent/.env
const envPath = resolve(ROOT, "ai-agent", ".env");
if (existsSync(envPath)) {
  const existing = readFileSync(envPath, "utf8");
  if (!existing.includes("KAI_AGENT_REGISTRY=0x")) {
    const additions = `\nKAI_AGENT_REGISTRY=${registryAddr}\nKAI_ESCROW_ADDRESS=${escrowAddr}\nCHAIN_ID=11155111\n`;
    writeFileSync(envPath, existing + additions);
    console.log("  ✓ ai-agent/.env updated");
  } else {
    console.log("  ℹ  ai-agent/.env already set — not modified");
  }
}

console.log("\n─────────────────────────────────────────────────");
console.log("✅ ALL DEPLOYMENTS COMPLETE");
console.log(`  KaiAMM           : ${ammAddr}`);
for (const [sym, v] of Object.entries(vaults))
  console.log(`  KaiVault ${sym.padEnd(7)}: ${v.address}`);
for (const p of pools)
  console.log(`  Pool ${p.pair.padEnd(13)}: ${p.address}`);
console.log(`  KaiAgentRegistry : ${registryAddr}`);
console.log(`  KaiEscrow        : ${escrowAddr}`);
console.log("─────────────────────────────────────────────────\n");
