"""
test_x402_hedera_flow.py
End-to-end smoke test for the Hedera X402 payment rail.

What it does:
  1. GET  /agents/x402/info        -> confirms Hedera treasury/token config
  2. pay_and_call() a real priced route (/agents/docs/ask) — this makes the
     request, receives HTTP 402, signs an HBAR payment with HEDERA_OPERATOR_KEY,
     retries with the X-PAYMENT header, and returns the settled response.
  3. Prints the receipt (tx id, amount, network) returned by the server.

The server independently verifies settlement via the Hedera Mirror Node
before returning a 200 (see agents/x402_rails.py: verify_hedera_payment) —
this script does not need to re-verify that itself.

Requirements to actually settle on-chain (until then this fails fast with a
clear "not configured" error instead of a confusing crash):
  HEDERA_OPERATOR_ID   — your testnet account, e.g. 0.0.1234567
  HEDERA_OPERATOR_KEY  — that account's private key
  (get both for free at https://portal.hedera.com -> Testnet -> Create Account)

Run:
  python test_x402_hedera_flow.py
"""
from __future__ import annotations
import asyncio
import os
import sys
import httpx
from dotenv import load_dotenv

load_dotenv()

BASE_URL = os.getenv("AGENT_BASE_URL", "http://127.0.0.1:8000")
TEST_ROUTE = f"{BASE_URL}/agents/docs/ask"


async def main() -> int:
    operator_id = os.getenv("HEDERA_OPERATOR_ID", "")
    operator_key = os.getenv("HEDERA_OPERATOR_KEY", "")

    if not operator_id or not operator_key or operator_id == "0.0.xxxxxx":
        print(
            "BLOCKED: HEDERA_OPERATOR_ID / HEDERA_OPERATOR_KEY are not set in .env.\n"
            "Get a free funded testnet account at https://portal.hedera.com "
            "(Testnet -> Create Account), then put the Account ID and Private Key "
            "into the root .env and re-run this script."
        )
        return 1

    print(f"== Step 1: checking X402 config at {BASE_URL}/agents/x402/info ==")
    async with httpx.AsyncClient(timeout=10.0) as client:
        info = (await client.get(f"{BASE_URL}/agents/x402/info")).json()
    hedera_cfg = info.get("hedera", {})
    print(f"   hedera enabled : {hedera_cfg.get('enabled')}")
    print(f"   network        : {hedera_cfg.get('network')}")
    print(f"   treasury       : {hedera_cfg.get('treasury')}")
    if hedera_cfg.get("treasury") in ("0.0.xxxxxx", "", None):
        print("BLOCKED: server's HEDERA_OPERATOR_ID (treasury) isn't configured either — "
              "restart the backend after setting it in .env.")
        return 1

    print(f"\n== Step 2: paying for {TEST_ROUTE} via X402 (Hedera HBAR) ==")
    from agents.x402_payer import pay_and_call  # local import: needs repo root on path

    try:
        result, receipt = await pay_and_call(
            TEST_ROUTE,
            method="POST",
            json_body={"question": "What is a Conservation NFT?"},
            hedera_account=operator_id,
        )
    except Exception as e:
        print(f"FAILED: {e}")
        return 1

    if receipt is None:
        print("No payment was required (route may be priced at 0, or already free) — "
              "response received directly:")
        print(result)
        return 0

    print("== Step 3: settled ==")
    print(f"   network         : {receipt.network}")
    print(f"   transaction id  : {receipt.hedera_tx_id}")
    print(f"   amount          : {receipt.amount} {receipt.amount_unit}")
    print(f"   view on HashScan: https://hashscan.io/testnet/transaction/{receipt.hedera_tx_id}")
    print("\nResponse from server (post-payment):")
    print(result)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
