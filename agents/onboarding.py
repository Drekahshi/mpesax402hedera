"""
agents/onboarding.py
KAI Learner Onboarding Assistant.

Guides new users step-by-step through the KAI Nuvari ecosystem.
Adapts to the user's current step, experience level, and goals.
Tracks progress and picks up where they left off.

Steps:
  1. Wallet setup (MetaMask / Web3 Wallets)
  2. Add Sepolia / Hedera Testnet network
  3. Get testnet ETH from faucet
  4. Connect to KAI Nuvari app
  5. View token balances
  6. Make first yBOB deposit into vault
  7. Explore the AMM pools
  8. Create first policy (insurance / pension)
  9. Use the AI agent chat
  10. Join DAO governance
"""

from __future__ import annotations
import os
import json
import time
from typing import AsyncIterator
from .base import AgentBase

PROGRESS_PATH = os.path.join(os.path.dirname(__file__), "..", "onboarding_progress.json")

SYSTEM = """You are KAI Guide — the friendly onboarding assistant for KAI Nuvari DeFi platform.

Your personality:
- Warm, patient, encouraging
- Use simple language — no jargon without explanation
- Celebrate small wins with the user ("Great job! 🎉")
- Always give the EXACT next action (URL, button name, exact amount)
- Keep responses focused — one step at a time

KAI Nuvari is a DeFi platform on Sepolia / Hedera Testnet testnet (free to use, no real money).
URL: http://localhost:3000

The 10 onboarding steps:
1. Install MetaMask or Web3 Wallets browser extension
2. Add Sepolia / Hedera Testnet network (ChainID: 11155111, RPC: https://rpc.sepolia.org)
3. Get free testnet ETH at https://sepoliafaucet.com
4. Visit http://localhost:3000 and click "Connect Wallet"
5. View your token balances on the home dashboard
6. Go to Vaults → deposit 100 yBOB into the yBOB Vault (7.5% APY)
7. Go to Pools → explore NVR/yBOB pool, understand liquidity provision
8. Go to Playground → create your first KAI Pension policy (0.0001 network fee)
9. Open the AI Agent chat and ask "What tokens does KAI have?"
10. Read about DAO governance and NVR voting power

Always tell the user:
- What they just accomplished
- What the next step is
- Why this step matters for their DeFi journey
- Estimated time for this step"""

STEP_GUIDES = {
    1: {
        "title": "Install Your Wallet",
        "summary": "Get a crypto wallet to interact with KAI Nuvari",
        "actions": [
            "Go to https://metamask.io and click 'Download'",
            "Install the browser extension",
            "Create a new wallet and save your 12-word seed phrase SECURELY",
            "Never share your seed phrase with anyone"
        ],
        "why": "Your wallet is your identity on the blockchain — it holds your tokens and signs transactions",
        "time": "5 minutes",
        "tip": "Web3 Wallet (metamask.io) is built by KAI Network Labs and works great with Ethereum & Hedera",
    },
    2: {
        "title": "Add Sepolia / Hedera Testnet Network",
        "summary": "Connect your wallet to the Ethereum & Hedera test network",
        "actions": [
            "Open MetaMask → click the network dropdown (top center)",
            "Click 'Add network manually'",
            "Network Name: Sepolia / Hedera Rails (X402)",
            "RPC URL: https://rpc.sepolia.org",
            "Chain ID: 11155111",
            "Currency symbol: ETH",
            "Click Save"
        ],
        "why": "KAI Nuvari runs on Sepolia / Hedera Testnet — a test network where everything is free",
        "time": "2 minutes",
    },
    3: {
        "title": "Get Free Testnet ETH",
        "summary": "Get ETH tokens to pay for transactions",
        "actions": [
            "Go to https://sepoliafaucet.com",
            "Select 'Sepolia (EVM)'",
            "Paste your wallet address",
            "Click 'Request 2 ETH'",
            "Wait 30 seconds and check your balance"
        ],
        "why": "You need a tiny amount of ETH (about 0.0001) to pay 'gas fees' for each transaction",
        "time": "2 minutes",
        "tip": "2 ETH testnet is more than enough for hundreds of transactions",
    },
    4: {
        "title": "Connect to KAI Nuvari",
        "summary": "Open the app and connect your wallet",
        "actions": [
            "Open http://localhost:3000 in your browser",
            "Click the red 'Connect Wallet' button (top right)",
            "Select 'MetaMask' or 'Web3 Wallet'",
            "Click 'Connect' in the wallet popup",
            "You'll see your address appear on the dashboard"
        ],
        "why": "Connecting your wallet lets the app read your balances and sign transactions on your behalf",
        "time": "1 minute",
    },
    5: {
        "title": "View Your Balances",
        "summary": "See your ETH and ecosystem token balances",
        "actions": [
            "On the home dashboard, scroll to the token balance strip",
            "You'll see: ETH, NVR, yBOB, YTOKEN, YGOLD, GAMI, CENTS",
            "Click 'Refresh Balances' to update",
            "Most tokens will show 0.000 — that's normal for a new wallet"
        ],
        "why": "KAI Nuvari has 6 ecosystem tokens, each with a specific role in the platform",
        "time": "1 minute",
        "tip": "The deployer wallet (0xaA99...) holds the tokens. Your balance starts at 0 until you receive or mine them.",
    },
    6: {
        "title": "Make Your First Vault Deposit",
        "summary": "Earn 7.5% APY by depositing yBOB into the vault",
        "actions": [
            "Click 'Vaults' in the home quick actions",
            "Find 'yBOB Stable' vault (7.5% APY)",
            "Click to expand it",
            "First get some yBOB: go to Mining & Airdrops → claim daily reward",
            "Return to Vaults → enter amount → click 'Deposit'",
            "Approve the transaction in your wallet",
            "You'll receive kvyBOB share tokens representing your position"
        ],
        "why": "Depositing in a vault is the safest way to earn yield in DeFi — no impermanent loss risk",
        "time": "5 minutes",
    },
    7: {
        "title": "Explore Liquidity Pools",
        "summary": "Understand how the KAI AMM works",
        "actions": [
            "Click 'Pools' in the navigation",
            "Watch the bubble animation — each bubble is an active pool",
            "Click the ⇄ Swap tab",
            "Select NVR as input, yBOB as output",
            "Type '1' in the amount — watch the live quote appear below",
            "The quote reads from the real NVR/yBOB pool on Sepolia"
        ],
        "why": "Liquidity pools let you swap tokens instantly. The price is determined by the ratio of reserves (x*y=k)",
        "time": "5 minutes",
    },
    8: {
        "title": "Create Your First Policy",
        "summary": "Set up a micro-pension or insurance policy",
        "actions": [
            "Click 'Playground' (⚗️) in quick actions",
            "Click 'Build Policy' in the left sidebar",
            "Select 'KAI Pension' template",
            "Fill in: Vesting period: 5, Monthly deposit: 10, Beneficiary: your address",
            "Click 'Create Policy · 0.0001 ETH'",
            "Approve the tiny network fee in your wallet"
        ],
        "why": "Policies are on-chain smart contracts that automate savings and protection for you",
        "time": "5 minutes",
    },
    9: {
        "title": "Chat with the AI Agent",
        "summary": "Ask KAI anything about the ecosystem",
        "actions": [
            "Click 'AI Agent' (🤖) in quick actions",
            "Type: 'What tokens does KAI have and what are their APYs?'",
            "Read the answer — the agent uses the official KAI docs",
            "Try: 'How do I earn yield with yBOB?'",
            "Try: 'What is impermanent loss?'"
        ],
        "why": "The AI agent knows everything about KAI Nuvari and can guide you through any feature",
        "time": "5 minutes",
    },
    10: {
        "title": "Explore DAO Governance",
        "summary": "Learn how NVR holders govern the platform",
        "actions": [
            "Go to Playground → DAO Drafter section",
            "Read about how NVR token gives voting power",
            "Try creating a sample DAO proposal",
            "Explore the Securities page for governance-linked products"
        ],
        "why": "KAI Nuvari is community-governed — NVR holders vote on protocol changes, fee rates, and new products",
        "time": "10 minutes",
        "next": "🎉 Congratulations! You've completed the KAI Nuvari onboarding!",
    },
}


def _load_progress() -> dict:
    try:
        if os.path.exists(PROGRESS_PATH):
            return json.loads(open(PROGRESS_PATH).read())
    except Exception:
        pass
    return {}


def _save_progress(progress: dict) -> None:
    try:
        open(PROGRESS_PATH, "w").write(json.dumps(progress, indent=2))
    except Exception:
        pass


class OnboardingAgent(AgentBase):
    name = "onboarding"
    description = "KAI learner step-by-step onboarding guide — from wallet setup to DAO governance"

    def _get_step_context(self, step: int) -> str:
        guide = STEP_GUIDES.get(step, {})
        if not guide:
            return f"Step {step} not found. Valid steps: 1-10."
        return f"""
Step {step}/10: {guide['title']}
Goal: {guide['summary']}
Estimated time: {guide.get('time', '5 minutes')}

Actions:
{chr(10).join(f'  {i+1}. {a}' for i, a in enumerate(guide['actions']))}

Why this matters: {guide['why']}
{f"Pro tip: {guide['tip']}" if guide.get('tip') else ''}
{f"Next after this: {guide.get('next','')}" if guide.get('next') else ''}"""

    async def run(
        self,
        user_id:    str = "default",
        question:   str = "Where do I start?",
        step:       int | None = None,
        complete_step: int | None = None,
        experience: str = "beginner",
    ) -> dict:
        # Load or init progress
        progress = _load_progress()
        user_progress = progress.get(user_id, {
            "user_id":       user_id,
            "current_step":  1,
            "completed":     [],
            "started_at":    time.time(),
            "experience":    experience,
        })

        # Mark step complete if requested
        if complete_step and complete_step not in user_progress["completed"]:
            user_progress["completed"].append(complete_step)
            if complete_step >= user_progress["current_step"]:
                user_progress["current_step"] = complete_step + 1

        progress[user_id] = user_progress
        _save_progress(progress)

        # Determine which step to show
        show_step = step or user_progress["current_step"]
        show_step = min(max(show_step, 1), 10)

        step_context = self._get_step_context(show_step)
        completed_pct = len(user_progress["completed"]) * 10

        prompt = f"""User: {user_id} | Experience: {experience}
Progress: {len(user_progress['completed'])}/10 steps done ({completed_pct}%)
Completed steps: {user_progress['completed']}
Current step: {user_progress['current_step']}

Question: {question}

Relevant step context:
{step_context}

All available steps for reference:
{json.dumps({k: {'title': v['title'], 'summary': v['summary']} for k, v in STEP_GUIDES.items()}, indent=2)}

Guide the user clearly and warmly."""

        response = await self.complete(prompt, system=SYSTEM)
        return {
            "agent":         self.name,
            "user_id":       user_id,
            "current_step":  user_progress["current_step"],
            "completed":     user_progress["completed"],
            "progress_pct":  completed_pct,
            "step_guide":    STEP_GUIDES.get(show_step, {}),
            "response":      response,
        }

    async def stream(
        self,
        user_id:    str = "default",
        question:   str = "Where do I start?",
        step:       int | None = None,
        experience: str = "beginner",
    ) -> AsyncIterator[str]:
        progress    = _load_progress()
        user_prog   = progress.get(user_id, {"current_step": 1, "completed": []})
        show_step   = step or user_prog["current_step"]
        step_ctx    = self._get_step_context(min(max(show_step, 1), 10))

        prompt = f"""User: {user_id} | Question: {question}
Progress: {len(user_prog['completed'])}/10

{step_ctx}"""

        async for chunk in self.stream_response(prompt, system=SYSTEM):
            yield chunk
