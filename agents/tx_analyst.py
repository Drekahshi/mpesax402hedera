"""
Agent 1: Transaction Analyst
Fetches raw transaction data from Sepolia / Hedera Testnet via JSON-RPC and explains
what it did in plain English using the Groq cloud model.
No external APIs — uses the public Sepolia RPC endpoint.
"""

from __future__ import annotations
import os
import json
from typing import AsyncIterator
import httpx
from .base import AgentBase

SEPOLIA_RPC = os.getenv("SEPOLIA_RPC_URL", "https://rpc.sepolia.org")
EXPLORER = "https://sepolia.etherscan.io"

SYSTEM = """You are a blockchain transaction analyst for Sepolia / Hedera Rails (X402).
You receive raw JSON data about a transaction or wallet and explain it in clear,
plain English. Be specific: name what contract was called, what tokens moved,
what the effect was. If the data suggests an error or failure, explain why.
Format your response with these sections:
- **What happened** (1-2 sentences)
- **Details** (amounts, addresses, contract interactions)
- **Status** (success/failed + gas used)
- **Plain English summary** (what this means for the user)"""


async def _rpc(method: str, params: list, rpc_url: str = SEPOLIA_RPC) -> dict:
    payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(rpc_url, json=payload)
        r.raise_for_status()
        return r.json().get("result", {})


def _wei_to_eth(wei_hex: str) -> float:
    try:
        return int(wei_hex, 16) / 1e18
    except Exception:
        return 0.0


def _decode_input(data: str) -> str:
    """Best-effort 4-byte selector decoding."""
    KNOWN = {
        "a9059cbb": "transfer(address,uint256)",
        "23b872dd": "transferFrom(address,address,uint256)",
        "095ea7b3": "approve(address,uint256)",
        "b6b55f25": "deposit(uint256)",
        "2e1a7d4d": "withdraw(uint256)",
        "38d52e0f": "asset()",
        "7ff36ab5": "swapExactETHForTokens(...)",
        "18cbafe5": "swapExactTokensForETH(...)",
        "e8eda9df": "deposit(address,uint256,address,uint16)",
        "a694fc3a": "stake(uint256)",
        "372500ab": "getReward()",
        "d0e30db0": "deposit()",
        "441a3e70": "withdraw(uint256,uint256)",
        "3d18b912": "getReward()",
        "60c20f5a": "removeLiquidity(address,address,uint256,uint256,uint256)",
        "e2bbb158": "deposit(uint256,uint256)",
    }
    if not data or data == "0x":
        return "Native ETH transfer (no contract call)"
    selector = data[2:10].lower()
    return KNOWN.get(selector, f"Contract call (selector: 0x{selector})")


class TxAnalystAgent(AgentBase):
    name = "tx_analyst"
    description = "Explains Sepolia / Hedera Testnet transactions in plain English"

    async def _fetch_tx(self, tx_hash: str) -> dict:
        tx      = await _rpc("eth_getTransactionByHash",   [tx_hash])
        receipt = await _rpc("eth_getTransactionReceipt",  [tx_hash])
        return {"tx": tx, "receipt": receipt}

    async def _fetch_wallet(self, address: str) -> dict:
        balance   = await _rpc("eth_getBalance",       [address, "latest"])
        tx_count  = await _rpc("eth_getTransactionCount", [address, "latest"])
        return {
            "address":  address,
            "eth_balance": _wei_to_eth(balance) if balance else 0,
            "tx_count": int(tx_count, 16) if tx_count else 0,
        }

    def _build_prompt(self, data: dict) -> str:
        tx      = data.get("tx") or {}
        receipt = data.get("receipt") or {}

        value_eth  = _wei_to_eth(tx.get("value", "0x0"))
        gas_used    = int(receipt.get("gasUsed", "0x0"), 16) if receipt.get("gasUsed") else 0
        gas_price   = int(tx.get("gasPrice", "0x0"), 16) / 1e9 if tx.get("gasPrice") else 0
        fee_eth    = (gas_used * gas_price) / 1e9
        status      = "✅ Success" if receipt.get("status") == "0x1" else "❌ Failed"
        logs_count  = len(receipt.get("logs", []))
        fn_called   = _decode_input(tx.get("input", "0x"))
        contract_addr = tx.get("to", "unknown")

        return f"""Transaction Hash: {tx.get('hash', 'unknown')}
From: {tx.get('from', 'unknown')}
To: {contract_addr}
Value: {value_eth:.6f} ETH
Function called: {fn_called}
Status: {status}
Gas used: {gas_used:,} ({fee_eth:.6f} network fee)
Log events emitted: {logs_count}
Block: {int(tx.get('blockNumber','0x0'), 16) if tx.get('blockNumber') else 'pending'}
Explorer: {EXPLORER}/tx/{tx.get('hash', '')}

Raw logs (first 3): {json.dumps(receipt.get('logs', [])[:3], indent=2)}

Please analyse this transaction and explain what happened."""

    async def run(self, tx_hash: str = "", address: str = "", rpc_url: str = SEPOLIA_RPC) -> dict:
        """
        Pass tx_hash to analyse a specific transaction.
        Pass address to get a wallet overview.
        """
        if tx_hash:
            data   = await self._fetch_tx(tx_hash)
            prompt = self._build_prompt(data)
        elif address:
            wallet = await self._fetch_wallet(address)
            prompt = f"Wallet overview on Sepolia / Hedera Testnet:\n{json.dumps(wallet, indent=2)}\nExplain this wallet's current state."
        else:
            return {"error": "Provide tx_hash or address"}

        explanation = await self.complete(prompt, system=SYSTEM)
        return {
            "agent":       self.name,
            "tx_hash":     tx_hash,
            "address":     address,
            "explanation": explanation,
            "explorer":    f"{EXPLORER}/tx/{tx_hash}" if tx_hash else f"{EXPLORER}/address/{address}",
        }

    async def stream(self, tx_hash: str = "", address: str = "", rpc_url: str = SEPOLIA_RPC) -> AsyncIterator[str]:
        if tx_hash:
            data   = await self._fetch_tx(tx_hash)
            prompt = self._build_prompt(data)
        elif address:
            wallet = await self._fetch_wallet(address)
            prompt = f"Wallet overview on Sepolia / Hedera Testnet:\n{json.dumps(wallet, indent=2)}\nExplain this wallet's current state."
        else:
            yield 'data: {"error": "Provide tx_hash or address"}\n\n'
            return

        async for chunk in self.stream_response(prompt, system=SYSTEM):
            yield chunk
