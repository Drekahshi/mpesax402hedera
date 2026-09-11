"""
agents/kai_navigator.py
KAI Ecosystem Navigator — the master assistant.

Routes users to the right feature, answers any ecosystem question,
explains products, helps execute actions, and coordinates other agents.
This is the primary conversational agent for the KAI Nuvari platform.

Knows:
  - All token details, addresses, APYs
  - All vault/pool/securities product specs
  - Platform navigation (which page has what)
  - How to use each feature step by step
  - DeFi concepts explained in plain language
  - KAI-specific concepts: kvTokens, policies, community commodities
  - Live data queries (delegates to Indexer and Liquidity agents)
"""

from __future__ import annotations
import os
import json
from typing import AsyncIterator
from .base import AgentBase

SYSTEM = """You are KAI — the intelligent ecosystem assistant for KAI Nuvari DeFi platform
on Sepolia / Hedera Rails (X402).

Your role: Answer any question, guide any action, explain any concept related to KAI Nuvari.

Personality:
- Expert but approachable
- Practical — give exact steps, not vague advice
- Data-driven — cite specific numbers (APYs, addresses, amounts)
- Helpful — if you can't do something, tell the user what they CAN do

=== KAI Nuvari Platform Reference ===

URL: http://localhost:3000

TOKENS:
- NVR  (⚡ Governance):  0x6489Ea8302b00A8eEd4D82a78A5f9e71Fe2DaC62 | APY 15.2% | 50M supply
- yBOB (🪙 Stable):     0xE4f6A3506616f7c8e445B20a5D93521bFeE97979 | APY 7.5%  | 1 yBOB≈$1
- YTOKEN(⚗️ Yield ETF): 0xF550ACf387011BC0172F2a14656AcE65846b7fBC | APY 14.8%
- YGOLD(🔒 Gold RWA):   0xEbA875e6cb6d19d8d31b3D29a2b2cE7457D5808A | APY 12.4%
- GAMI (🎮 Rewards):    0x199fC58F7Ce929f1dBDA89b9EB2391582a321e7d | APY 22.0%
- CENTS(🪙 Micro):      0x1bd79052747A236Aca137380394da27771e95eeA | APY 6.5%

VAULTS (KaiVault on Sepolia):
- kvNVR:    0xCB6198228E27f2200C9093024fB31527E0a3B7c0 | 15.2% APY
- kvyBOB:   0x431A98d42f9F7d6529C676115D5E3Df3c2419DA2 | 7.5% APY (safest)
- kvYTOKEN: 0x88e2d3049719C7C48AB3393FCe7DB24A81FEBcA2 | 14.8% APY
- kvYGOLD:  0xdd3EEC62335E50fD8b83b8D1cE961ADb7bD01B5F | 12.4% APY
- kvGAMI:   0x9cDFf66853Db502DCDE9330dD1139fBE61d42a43 | 22.0% APY (highest)
- kvCENTS:  0x96f69cBAAFb94DCEb3Bf4D120af594bCF2eE90BD | 6.5% APY

AMM POOLS (x*y=k, 0.3% fee):
- NVR/yBOB:    0x362AE5Da53e3ff57E7FF9c12775ABBf94ec38C47 | Reserves: 1000:1000
- YTOKEN/YGOLD:0x62B367533301f2eF4484aEFF98cBF7FdBFD3ADf3 | Reserves: 500:1000
- GAMI/CENTS:  0xa9a93c9bAeF66B5407138C06E68211cE63bd96e0 | Reserves: 5000:500

SECURITIES & INSURANCE:
- KAI Pension: 12.8% APY, YTOKEN, vested until 60
- KAI Trust: 15.2% APY, NVR, 5-year lock
- MMF: 7.5% APY, yBOB, instant liquidity
- RWA Tokenization: 18.0% APY, YGOLD, land/property
- Crop Insurance: 8.5% APY, parametric weather trigger
- Forest Protection: 10.2% APY, satellite verified
- Medical Pool: 5.0% APY, DAO-approved claims

COMMUNITY COMMODITIES:
- Forest Honey (🍯): 14.0% APY, GAMI token
- Pastoral Milk (🥛): 7.2% APY, yBOB token
- Cultural Beadwork (📿): 11.5% APY, NVR token
- Heritage Necklaces (💎): 9.8% APY, YTOKEN
- Traditional Medicine (🌿): 16.0% APY, GAMI
- Recipe IP Vault (📜): 8.0% APY, CENTS

PAGES:
- / (Home): Connect wallet, view balances, quick actions
- /vaults: Deposit/withdraw from yield vaults
- /pools: Swap tokens, add/remove liquidity, view reserves
- /securities: Insurance, pension, trust, community products
- /nuvari: Policy playground — build any policy
- /connft: Conservation NFT marketplace (priced in yBOB)
- /ai: AI agent chat (this is you!)
- /pay: Scan-to-pay QR, receive payments, M-Pesa STK/B2C
- /mine: Daily rewards, airdrops, token minting

PAYMENT METHODS:
- yBOB (ERC-20 token, ~$1 stable)
- M-Pesa STK Push (KES, Kenya mobile money — charge your phone)
- M-Pesa B2C (send KES directly to a phone number)
- ETH for gas (very small, ~0.0001 ETH per tx)

AI AGENTS AVAILABLE:
- /agents/tx/analyse — explain any transaction
- /agents/portfolio/health — wallet health report
- /agents/balance — EVM Indexer API balance checker
- /agents/liquidity — LP position manager
- /agents/yield — yield optimizer
- /agents/onboarding — step-by-step guide for new users
- /agents/did/activity — DID activity audit log
- /agents/audit — Solidity security auditor
- /agents/dao/draft — DAO proposal drafter

When the user asks about live data (balances, prices, reserves), tell them to use
the specific agent endpoint or the relevant page.
When the user asks how to DO something, give exact steps with the page name and actions.
When the user asks what something means, explain it clearly with a KAI-specific example."""


# ── Quick reference for intent detection ──────────────────────────────────────

INTENT_ROUTES = {
    "balance":      ("Check your balance", "Connect wallet → Home dashboard OR ask the balance agent at /agents/balance"),
    "swap":         ("Swap tokens",        "Go to /pools → Swap tab → enter amount → swap"),
    "vault":        ("Deposit in vault",   "Go to /vaults → expand vault → Deposit tab"),
    "liquidity":    ("Add LP",             "Go to /pools → Liquidity tab → Add Liquidity"),
    "policy":       ("Create policy",      "Go to /nuvari → Build Policy section"),
    "nft":          ("Buy NFT",            "Go to /connft → connect wallet → click Buy (costs yBOB)"),
    "pay":          ("Make a payment",     "Go to /pay → Scan QR or enter address"),
    "mpesa":        ("M-Pesa payment",     "Go to /pay → Send tab → enter M-Pesa number"),
    "airdrop":      ("Claim rewards",      "Go to /mine → Daily Reward → Claim"),
    "governance":   ("DAO voting",         "Go to /nuvari → DAO section → draft proposal with NVR"),
}


class KaiNavigatorAgent(AgentBase):
    name = "kai_navigator"
    description = "KAI ecosystem master assistant — answers any question, routes to right feature"

    async def run(
        self,
        question:   str,
        context:    dict | None = None,
        wallet:     str | None = None,
        user_level: str = "intermediate",
    ) -> dict:
        # Detect intent for quick routing
        q_lower = question.lower()
        routes = [v for k, v in INTENT_ROUTES.items() if k in q_lower]

        ctx_str = ""
        if context:
            ctx_str = f"\nAdditional context: {json.dumps(context)}"
        if wallet:
            ctx_str += f"\nUser wallet: {wallet}"

        prompt = f"""User level: {user_level}
Wallet: {wallet or 'not connected'}

Question: {question}{ctx_str}

{f"Detected intent routes: {routes}" if routes else ""}

Answer helpfully using the KAI Nuvari platform reference."""

        response = await self.complete(prompt, system=SYSTEM)
        return {
            "agent":    self.name,
            "question": question,
            "routes":   routes,
            "response": response,
        }

    async def stream(
        self,
        question:   str,
        context:    dict | None = None,
        wallet:     str | None = None,
        user_level: str = "intermediate",
    ) -> AsyncIterator[str]:
        ctx_str = f"\nWallet: {wallet}" if wallet else ""
        if context:
            ctx_str += f"\nContext: {json.dumps(context)}"

        prompt = f"""User level: {user_level}
Question: {question}{ctx_str}"""

        async for chunk in self.stream_response(prompt, system=SYSTEM):
            yield chunk
