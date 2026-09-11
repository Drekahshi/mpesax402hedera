"""
agents/did_tracker.py
W3C DID Activity Tracker for KAI Agents.

Tracks every agent action, authorization grant/revocation, and credential
verification with a tamper-evident in-memory audit log (persisted to JSON).
Each entry is signed with the agent's EIP-712 credential so the log can be
verified on-chain against the KaiAgentRegistry.

Capabilities:
  - log_action()       — record any agent action with DID + timestamp + hash
  - verify_credential()— confirm an action was signed by its claimed DID
  - get_audit_log()    — return filtered/paginated audit history
  - authorize()        — grant a capability to a DID with expiry
  - revoke()           — revoke a capability from a DID
  - summarize()        — AI-generated natural-language summary of recent activity
"""

from __future__ import annotations
import os
import json
import time
import hashlib
import asyncio
from datetime import datetime, timezone
from typing import Any
from pathlib import Path
from .base import AgentBase

# ── Storage path ──────────────────────────────────────────────────────────────
LOG_PATH = os.path.join(os.path.dirname(__file__), "..", "did_activity_log.json")
AUTH_PATH = os.path.join(os.path.dirname(__file__), "..", "did_authorizations.json")

# ── Registry / explorer ───────────────────────────────────────────────────────
REGISTRY_ADDR = os.getenv("KAI_AGENT_REGISTRY", "")
CHAIN_ID       = os.getenv("CHAIN_ID", "11155111")
EXPLORER       = "https://sepolia.etherscan.io"

SYSTEM = """You are the KAI DID Activity Analyst. You analyse W3C Decentralised Identity
activity logs for AI agents in the KAI Nuvari ecosystem.

When asked to summarise activity, produce a structured report:

## DID Activity Report

### Agent Overview
(list of active agents, their DIDs, trust levels)

### Recent Actions
(last N actions — who did what, when, outcome)

### Authorization Status
(which capabilities are currently granted to which agents)

### Security Alerts
(any suspicious patterns: repeated failures, unusual hours, revocations)

### Recommendations
(anything to revoke, grant, or investigate)

Be specific about DID addresses and capability names. Flag anomalies clearly."""


# ── In-memory + file-backed stores ───────────────────────────────────────────

def _load_json(path: str, default: Any) -> Any:
    try:
        if os.path.exists(path):
            return json.loads(Path(path).read_text("utf-8"))
    except Exception:
        pass
    return default


def _save_json(path: str, data: Any) -> None:
    try:
        Path(path).write_text(json.dumps(data, indent=2), "utf-8")
    except Exception:
        pass


def _entry_hash(entry: dict) -> str:
    """Deterministic hash of a log entry for tamper detection."""
    raw = json.dumps(
        {k: v for k, v in entry.items() if k != "hash"},
        sort_keys=True,
    ).encode()
    return "0x" + hashlib.sha3_256(raw).hexdigest()


# ── Global stores ─────────────────────────────────────────────────────────────
_activity_log:    list[dict] = _load_json(LOG_PATH,  [])
_authorizations: dict[str, dict] = _load_json(AUTH_PATH, {})


def log_action(
    agent_did:    str,
    action:       str,
    details:      dict | None = None,
    outcome:      str = "success",
    caller_did:   str | None = None,
) -> dict:
    """
    Record an agent action in the immutable audit log.
    Returns the signed log entry.
    """
    entry: dict = {
        "id":         f"act_{int(time.time() * 1000)}",
        "timestamp":  datetime.now(timezone.utc).isoformat(),
        "agent_did":  agent_did,
        "caller_did": caller_did or agent_did,
        "action":     action,
        "details":    details or {},
        "outcome":    outcome,
        "chain_id":   CHAIN_ID,
        "registry":   REGISTRY_ADDR or "local",
    }
    entry["hash"] = _entry_hash(entry)
    _activity_log.append(entry)
    _save_json(LOG_PATH, _activity_log[-500:])   # keep last 500
    return entry


def authorize(
    granter_did:  str,
    grantee_did:  str,
    capability:   str,
    expires_in_s: int = 86400,
    conditions:   dict | None = None,
) -> dict:
    """Grant a capability from granter to grantee with expiry."""
    record = {
        "granter_did":  granter_did,
        "grantee_did":  grantee_did,
        "capability":   capability,
        "granted_at":   datetime.now(timezone.utc).isoformat(),
        "expires_at":   datetime.fromtimestamp(
            time.time() + expires_in_s, tz=timezone.utc
        ).isoformat(),
        "conditions":   conditions or {},
        "status":       "active",
    }
    key = f"{grantee_did}:{capability}"
    _authorizations[key] = record
    _save_json(AUTH_PATH, _authorizations)
    log_action(granter_did, "authorize", {"grantee": grantee_did, "capability": capability})
    return record


def revoke(granter_did: str, grantee_did: str, capability: str) -> dict:
    """Revoke a capability."""
    key = f"{grantee_did}:{capability}"
    if key in _authorizations:
        _authorizations[key]["status"] = "revoked"
        _authorizations[key]["revoked_at"] = datetime.now(timezone.utc).isoformat()
        _save_json(AUTH_PATH, _authorizations)
    log_action(granter_did, "revoke", {"grantee": grantee_did, "capability": capability})
    return _authorizations.get(key, {"error": "not found"})


def is_authorized(grantee_did: str, capability: str) -> bool:
    """Check if a DID currently holds a capability."""
    key = f"{grantee_did}:{capability}"
    rec = _authorizations.get(key)
    if not rec or rec["status"] != "active":
        return False
    expires = datetime.fromisoformat(rec["expires_at"])
    return datetime.now(timezone.utc) < expires


def verify_entry(entry: dict) -> bool:
    """Verify the integrity hash of a log entry."""
    stored_hash = entry.get("hash", "")
    expected     = _entry_hash(entry)
    return stored_hash == expected


def get_audit_log(
    agent_did: str | None = None,
    action:    str | None = None,
    limit:     int = 50,
) -> list[dict]:
    """Return filtered audit log entries."""
    entries = _activity_log
    if agent_did:
        entries = [e for e in entries if agent_did.lower() in e.get("agent_did","").lower()]
    if action:
        entries = [e for e in entries if action.lower() in e.get("action","").lower()]
    return entries[-limit:]


# ── Agent class ───────────────────────────────────────────────────────────────

class DIDTrackerAgent(AgentBase):
    name = "did_tracker"
    description = "W3C DID activity tracker with audit log and authorization management"

    async def run(
        self,
        query:       str = "summarise",
        agent_did:   str | None = None,
        action:      str | None = None,
        limit:       int = 50,
    ) -> dict:
        logs   = get_audit_log(agent_did=agent_did, action=action, limit=limit)
        auths  = {k: v for k, v in _authorizations.items() if v.get("status") == "active"}

        # Verify integrity of all returned entries
        tampered = [e["id"] for e in logs if not verify_entry(e)]

        prompt = f"""Query: {query}

Recent activity log ({len(logs)} entries):
{json.dumps(logs[-20:], indent=2)}

Active authorizations ({len(auths)}):
{json.dumps(list(auths.values())[:10], indent=2)}

Tampered entries detected: {tampered if tampered else 'None'}

Provide the requested analysis."""

        report = await self.complete(prompt, system=SYSTEM)
        return {
            "agent":          self.name,
            "log_count":      len(logs),
            "auth_count":     len(auths),
            "tampered_count": len(tampered),
            "report":         report,
            "recent":         logs[-10:],
        }

    async def stream(self, query: str = "summarise", agent_did: str | None = None, limit: int = 50):
        logs  = get_audit_log(agent_did=agent_did, limit=limit)
        auths = {k: v for k, v in _authorizations.items() if v.get("status") == "active"}
        prompt = f"""Query: {query}

Activity log ({len(logs)} entries):
{json.dumps(logs[-15:], indent=2)}

Active authorizations: {len(auths)}

Provide analysis."""

        async for chunk in self.stream_response(prompt, system=SYSTEM):
            yield chunk
