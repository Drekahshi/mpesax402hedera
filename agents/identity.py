"""
agents/identity.py
W3C DID document builder + EIP-712 agent credential signing for KAI agents.

Every KAI agent gets a Decentralised Identity (DID) of the form:
    did:kai:<chainId>:<agentAddress>

The DID document is W3C-compliant JSON-LD and contains:
    - Verification methods (the agent's signing key)
    - Service endpoints (x402 payment endpoint, agent API)
    - Capability delegations (what the agent is authorised to do)

EIP-712 credentials are produced locally using eth_account — no external
signing service required.
"""

from __future__ import annotations
import os
import json
import time
import hashlib
from dataclasses import dataclass, field, asdict
from typing import Any
from eth_account import Account
from eth_account.messages import encode_typed_data
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

def _iso(ts: float | int | None = None) -> str:
    if ts is None:
        return datetime.now(timezone.utc).isoformat()
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()

# ── Chain config ──────────────────────────────────────────────────────────────
SEPOLIA_CHAIN_ID = int(os.getenv("CHAIN_ID", "11155111"))
REGISTRY_ADDR = os.getenv("KAI_AGENT_REGISTRY", "")   # filled after deploy
AGENT_BASE_URL = os.getenv("AGENT_BASE_URL", "http://127.0.0.1:8000")

# ── EIP-712 domain ────────────────────────────────────────────────────────────
EIP712_DOMAIN = {
    "name":              "KaiAgentRegistry",
    "version":           "1",
    "chainId":           SEPOLIA_CHAIN_ID,
    "verifyingContract": REGISTRY_ADDR or "0x0000000000000000000000000000000000000000",
}

# EIP-712 type for AgentAction (must match the contract's ACTION_TYPEHASH)
AGENT_ACTION_TYPES = {
    "EIP712Domain": [
        {"name": "name",              "type": "string"},
        {"name": "version",           "type": "string"},
        {"name": "chainId",           "type": "uint256"},
        {"name": "verifyingContract", "type": "address"},
    ],
    "AgentAction": [
        {"name": "agent",    "type": "address"},
        {"name": "actionId", "type": "bytes32"},
        {"name": "value",    "type": "uint256"},
        {"name": "nonce",    "type": "uint256"},
        {"name": "deadline", "type": "uint256"},
    ],
}


# ── Data classes ──────────────────────────────────────────────────────────────

@dataclass
class AgentCapabilities:
    """What this agent is allowed to do."""
    can_analyse_transactions: bool  = True
    can_audit_contracts:      bool  = True
    can_draft_proposals:      bool  = True
    can_execute_swaps:        bool  = False  # requires elevated trust
    can_manage_vault:         bool  = False  # requires elevated trust
    can_call_external_apis:   bool  = False
    max_payment_usd:          float = 1.0    # per-call ceiling in USD
    daily_budget_usd:         float = 10.0
    allowed_tokens:           list[str] = field(default_factory=list)

    def to_hash(self) -> str:
        """Return keccak-256 hex of the JSON capabilities (matches contract)."""
        raw = json.dumps(asdict(self), sort_keys=True).encode()
        return "0x" + hashlib.sha3_256(raw).hexdigest()


@dataclass
class AgentPassport:
    """W3C-compliant DID document for a KAI agent."""
    agent_address:    str
    owner_address:    str
    name:             str
    description:      str
    capabilities:     AgentCapabilities
    chain_id:         int   = SEPOLIA_CHAIN_ID
    service_endpoint: str   = AGENT_BASE_URL
    created_at:       float = field(default_factory=time.time)
    updated_at:       float = field(default_factory=time.time)
    nonce:            int   = 0

    @property
    def did(self) -> str:
        return f"did:kai:{self.chain_id}:{self.agent_address.lower()}"

    def to_w3c_document(self) -> dict:
        """Build a W3C DID document (JSON-LD)."""
        return {
            "@context": [
                "https://www.w3.org/ns/did/v1",
                "https://w3id.org/security/suites/secp256k1-2020/v1",
                "https://kai.nuvari/context/v1",
            ],
            "id": self.did,
            "controller": f"did:kai:{self.chain_id}:{self.owner_address.lower()}",
            "verificationMethod": [
                {
                    "id":                 f"{self.did}#key-1",
                    "type":               "EcdsaSecp256k1VerificationKey2020",
                    "controller":         self.did,
                    "blockchainAccountId": f"eip155:{self.chain_id}:{self.agent_address}",
                }
            ],
            "authentication":       [f"{self.did}#key-1"],
            "assertionMethod":      [f"{self.did}#key-1"],
            "capabilityDelegation": [f"{self.did}#key-1"],
            "service": [
                {
                    "id":              f"{self.did}#x402",
                    "type":            "X402PaymentEndpoint",
                    "serviceEndpoint": f"{self.service_endpoint}/agents/x402/pay",
                    "description":     "x402 HTTP payment channel for agent services",
                },
                {
                    "id":              f"{self.did}#api",
                    "type":            "KaiAgentAPI",
                    "serviceEndpoint": self.service_endpoint,
                    "description":     self.description,
                },
                {
                    "id":              f"{self.did}#registry",
                    "type":            "KaiAgentRegistry",
                    "serviceEndpoint": f"https://sepolia.etherscan.io/address/{REGISTRY_ADDR}",
                    "contractAddress": REGISTRY_ADDR,
                    "chainId":         str(self.chain_id),
                },
            ],
            "kaiCapabilities": {
                "capabilityHash":  self.capabilities.to_hash(),
                "capabilities":    asdict(self.capabilities),
                "spendPolicy": {
                    "maxPaymentUsd":  self.capabilities.max_payment_usd,
                    "dailyBudgetUsd": self.capabilities.daily_budget_usd,
                    "allowedTokens":  self.capabilities.allowed_tokens,
                },
            },
            "proof": {
                "type":               "EcdsaSecp256k1Signature2020",
                "created":            _iso(self.created_at),
                "proofPurpose":       "assertionMethod",
                "verificationMethod": f"{self.did}#key-1",
            },
            "created":  _iso(self.created_at),
            "updated":  _iso(self.updated_at),
        }

    def to_registry_args(self) -> dict:
        """Return the args needed to call KaiAgentRegistry.registerAgent()."""
        caps = self.capabilities
        return {
            "agentAddress":   self.agent_address,
            "name":           self.name,
            "description":    self.description,
            "serviceEndpoint":self.service_endpoint,
            "capabilities":   json.dumps(asdict(caps), sort_keys=True),
            "dailySpendLimit": int(caps.daily_budget_usd * 1e18),   # mock: 1 USD = 1e18 wei
            "perTxLimit":      int(caps.max_payment_usd  * 1e18),
        }


# ── EIP-712 signing ───────────────────────────────────────────────────────────

class AgentSigner:
    """
    Signs EIP-712 AgentAction credentials with an Ethereum private key.
    The private key is the agent's EOA — stored only in env, never logged.
    """

    def __init__(self, private_key: str | None = None):
        pk = private_key or os.getenv("AGENT_PRIVATE_KEY") or os.getenv("PRIVATE_KEY")
        if not pk:
            raise ValueError(
                "No signing key found. Set AGENT_PRIVATE_KEY or PRIVATE_KEY in .env"
            )
        pk = pk.strip().replace('"', "").replace("'", "")
        if not pk.startswith("0x"):
            pk = "0x" + pk
        self.account = Account.from_key(pk)
        self.address = self.account.address

    def sign_action(
        self,
        action_id:  str,        # hex string or plain string (will be hashed)
        value:      int,        # in wei
        nonce:      int,
        deadline:   int | None = None,
    ) -> dict:
        """
        Produce an EIP-712 signed AgentAction credential.
        Returns a dict with: signature, signer, action_id, deadline, nonce.
        """
        if deadline is None:
            deadline = int(time.time()) + 3600  # 1 hour from now

        # Normalise actionId to bytes32 hex
        if action_id.startswith("0x") and len(action_id) == 66:
            action_id_bytes = bytes.fromhex(action_id[2:])
        else:
            action_id_bytes = hashlib.sha3_256(action_id.encode()).digest()

        # Pad to 32 bytes
        action_id_32 = action_id_bytes[:32].ljust(32, b"\x00")

        typed_data = {
            "types":       AGENT_ACTION_TYPES,
            "domain":      EIP712_DOMAIN,
            "primaryType": "AgentAction",
            "message": {
                "agent":    self.address,
                "actionId": "0x" + action_id_32.hex(),
                "value":    value,
                "nonce":    nonce,
                "deadline": deadline,
            },
        }

        signed   = self.account.sign_typed_data(
            domain_data=EIP712_DOMAIN,
            message_types={"AgentAction": AGENT_ACTION_TYPES["AgentAction"]},
            message_data=typed_data["message"],
        )

        return {
            "signature":  signed.signature.hex(),
            "signer":     self.address,
            "action_id":  "0x" + action_id_32.hex(),
            "value":      value,
            "nonce":      nonce,
            "deadline":   deadline,
            "typed_data": typed_data,
        }

    def sign_payment_release(
        self,
        escrow_id:  str,    # bytes32 hex
        amount:     int,    # wei
        nonce:      int,
    ) -> dict:
        """Sign an escrow release credential (proves service was delivered)."""
        action_id = "0x" + hashlib.sha3_256(
            b"release" + bytes.fromhex(escrow_id.replace("0x", ""))
        ).hexdigest()
        return self.sign_action(action_id, amount, nonce)


# ── DID Document store (in-memory, survives process lifetime) ─────────────────

_DID_STORE: dict[str, dict] = {}   # did → W3C document
_PASSPORT_STORE: dict[str, AgentPassport] = {}  # address → passport


def register_local(passport: AgentPassport) -> dict:
    """Register an agent passport in the local in-memory DID store."""
    doc = passport.to_w3c_document()
    _DID_STORE[passport.did]                   = doc
    _PASSPORT_STORE[passport.agent_address.lower()] = passport
    return doc


def resolve_did(did: str) -> dict | None:
    """Resolve a did:kai:... document from the local store."""
    return _DID_STORE.get(did)


def resolve_address(address: str) -> AgentPassport | None:
    return _PASSPORT_STORE.get(address.lower())


# ── Pre-register the 8 KAI agents ────────────────────────────────────────────
# These passports are registered at import time so the server has a DID for
# each agent immediately, before on-chain registration is done.

_KAI_AGENTS = [
    ("tx_analyst",         "KAI Transaction Analyst",       "Explains Sepolia transactions in plain English",             AgentCapabilities(can_analyse_transactions=True,  max_payment_usd=0.01, daily_budget_usd=1.0)),
    ("portfolio_health",   "KAI Portfolio Health Agent",    "Analyses wallet holdings and DeFi positions",             AgentCapabilities(can_analyse_transactions=True,  max_payment_usd=0.02, daily_budget_usd=2.0)),
    ("contract_auditor",   "KAI Contract Auditor",          "Security audits Solidity smart contracts",                AgentCapabilities(can_audit_contracts=True,       max_payment_usd=0.05, daily_budget_usd=5.0)),
    ("dao_drafter",        "KAI DAO Drafter",               "Drafts formal KAI governance proposals",              AgentCapabilities(can_draft_proposals=True,       max_payment_usd=0.02, daily_budget_usd=2.0)),
    ("commodity_pricing",  "KAI Commodity Pricing Agent",   "Community commodity market analysis",                     AgentCapabilities(max_payment_usd=0.01, daily_budget_usd=1.0)),
    ("policy_recommender", "KAI Policy Recommender",        "Personalised KAI product recommendations",            AgentCapabilities(max_payment_usd=0.02, daily_budget_usd=2.0)),
    ("code_gen",           "KAI Solidity Code Generator",   "Generates and self-corrects Solidity contracts",          AgentCapabilities(can_audit_contracts=True,       max_payment_usd=0.10, daily_budget_usd=10.0)),
    ("doc_summarizer",     "KAI Document Summarizer",       "Document Q&A via local RAG",                             AgentCapabilities(max_payment_usd=0.01, daily_budget_usd=1.0)),
]

# Use deterministic addresses derived from agent name (for local dev — replace
# with real deployed addresses after running deploy-agent-infra.ts)
def _deterministic_address(seed: str) -> str:
    h = hashlib.sha3_256(seed.encode()).hexdigest()
    return "0x" + h[:40]

for _name, _label, _desc, _caps in _KAI_AGENTS:
    _addr = os.getenv(f"KAI_AGENT_{_name.upper()}_ADDRESS") or _deterministic_address(_name)
    _p = AgentPassport(
        agent_address=_addr,
        owner_address=os.getenv("WALLET_ADDRESS", "0x0000000000000000000000000000000000000000"),
        name=_label,
        description=_desc,
        capabilities=_caps,
    )
    register_local(_p)


# ── Utility ───────────────────────────────────────────────────────────────────
# NOTE: _iso() is defined once at the top of this module (timezone-aware).
# The duplicate UTC-naive version that was here has been removed.

def list_agent_dids() -> list[dict]:
    """Return a summary list of all registered agent DIDs."""
    return [
        {
            "did":     p.did,
            "name":    p.name,
            "address": p.agent_address,
            "capabilities_hash": p.capabilities.to_hash(),
        }
        for p in _PASSPORT_STORE.values()
    ]
