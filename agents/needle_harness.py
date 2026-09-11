"""
agents/needle_harness.py
Needle (Cactus Compute) tool-calling harness for KAI Nuvari.

Needle 2 is a 45M-parameter model (14 MB binary) that maps
(query, tool list) → structured JSON function call in one forward pass.
No Groq key required for tool dispatch — Needle runs entirely on-device.

Architecture:
    User query → Needle (selects tool + fills args) → KAI tool executes
                                                     → result fed back
                                                     → Needle generates final response

Tools exposed to Needle:
    - hedera_account_info     — HBAR + token balances for a Hedera account
    - hedera_kaibar_balance   — KAIBAR balance for a Hedera account
    - hedera_transaction_history — recent tx history
    - hedera_hcs_audit        — recent HCS audit log entries
    - mint_kaibar             — mint KAIBAR tokens to a recipient
    - mint_conservation_nft   — mint a Conservation NFT for an event
    - x402_payment_info       — x402 route prices and payment config
    - hedera_health           — Hedera rail status

Usage:
    from agents.needle_harness import KaiNeedleHarness, run_needle_agent
    result = await run_needle_agent("How much KBAR does 0.0.1234 have?")
"""

from __future__ import annotations
import asyncio
import os
from typing import Any
import needle

# Import KAI Hedera tools (all async — wrapped below for Needle's sync interface)
from agents.hedera_rails import (
    get_account_info,
    get_token_balance,
    get_transaction_history,
    get_hcs_messages,
    mint_kaibar,
    mint_conservation_nft,
    KAIBAR_TOKEN,
    CONNFT_TOKEN,
    AUDIT_TOPIC,
    NETWORK as HEDERA_NETWORK,
)
from agents.x402_rails import get_x402_info


def _run(coro) -> Any:
    """
    Run an async coroutine from a sync context.

    Needle calls tools synchronously. Tools need to call async Mirror Node
    functions. This helper bridges the gap safely regardless of whether there
    is already a running event loop (FastAPI context) or not (Needle worker).

    Strategy:
    - If no loop is running: use asyncio.run() directly (simplest, no deadlock).
    - If a loop IS running (FastAPI/uvicorn thread): create a brand-new event
      loop in a dedicated thread so we never block the running loop.
    """
    try:
        # Check if there is already a running loop in this thread
        running = asyncio.get_running_loop()
    except RuntimeError:
        running = None

    if running is None:
        # No running loop — safe to use asyncio.run()
        return asyncio.run(coro)
    else:
        # Loop already running (FastAPI) — run in a fresh thread with its own loop
        import concurrent.futures

        result_holder: list = []
        exc_holder:    list = []

        def _target():
            new_loop = asyncio.new_event_loop()
            asyncio.set_event_loop(new_loop)
            try:
                result_holder.append(new_loop.run_until_complete(coro))
            except Exception as exc:
                exc_holder.append(exc)
            finally:
                new_loop.close()

        t = concurrent.futures.ThreadPoolExecutor(max_workers=1)
        fut = t.submit(_target)
        fut.result(timeout=30)
        t.shutdown(wait=False)

        if exc_holder:
            raise exc_holder[0]
        return result_holder[0] if result_holder else None


# ── Tool definitions ───────────────────────────────────────────────────────────

@needle.tool
def hedera_account_info(account_id: str) -> dict:
    """
    Get the current HBAR balance and list of HTS token holdings for a Hedera account.
    Use ONLY for balance lookups and token holdings — NOT for transaction history.
    Call this when the user asks: 'balance', 'how much HBAR', 'token holdings',
    'what tokens does account X have', 'account overview'.
    account_id: must be a Hedera account ID in the format 0.0.XXXXXX — copy it
                exactly from the user's message. Example: '0.0.5834216'
    """
    if not account_id or not account_id.startswith("0.0."):
        return {"error": f"Invalid account_id '{account_id}' — must be in format 0.0.XXXXXX"}
    return _run(get_account_info(account_id))


@needle.tool
def hedera_kaibar_balance(account_id: str) -> dict:
    """
    Get the KAIBAR (KBAR) token balance for a Hedera account.
    Call this when the user asks specifically about KBAR or KAIBAR tokens.
    account_id: must be a Hedera account ID in the format 0.0.XXXXXX — copy it
                exactly from the user's message. Example: '0.0.5834216'
    """
    if not account_id or not account_id.startswith("0.0."):
        return {"error": f"Invalid account_id '{account_id}' — must be in format 0.0.XXXXXX"}
    if not KAIBAR_TOKEN:
        return {"error": "HEDERA_KAIBAR_TOKEN_ID not configured"}
    return _run(get_token_balance(account_id, KAIBAR_TOKEN))


@needle.tool
def hedera_transaction_history(account_id: str, limit: int = 10) -> dict:
    """
    Get a list of recent past transactions (payments, transfers, mints) for a Hedera account.
    Use ONLY for transaction lists — NOT for current balance or token holdings.
    Call this when the user asks: 'transactions', 'tx history', 'recent activity',
    'what happened on account X', 'payments sent or received', 'transfer history'.
    account_id: must be a Hedera account ID in the format 0.0.XXXXXX — copy it
                exactly from the user's message. Example: '0.0.5834216'
    limit: integer number of transactions to return, between 1 and 25. Default 10.
    """
    if not account_id or not account_id.startswith("0.0."):
        return {"error": f"Invalid account_id '{account_id}' — must be in format 0.0.XXXXXX"}
    txs = _run(get_transaction_history(account_id, min(int(limit), 25)))
    return {"account_id": account_id, "transactions": txs}


@needle.tool
def hedera_hcs_audit_log(limit: int = 10) -> dict:
    """
    Get recent HCS (Hedera Consensus Service) audit log entries from the
    KAI Nuvari audit topic. Call this when the user asks about the audit log,
    recent on-chain events, conservation records, or HCS messages.
    limit: integer number of messages to return, between 1 and 25. Default 10.
    """
    if not AUDIT_TOPIC:
        return {"error": "HEDERA_AUDIT_TOPIC_ID not configured — run create-hcs-topic.ts first"}
    msgs = _run(get_hcs_messages(AUDIT_TOPIC, min(int(limit), 25)))
    return {"topic_id": AUDIT_TOPIC, "messages": msgs}


@needle.tool
def mint_kaibar_tokens(recipient_account_id: str, amount: float, reason: str) -> dict:
    """
    Mint KAIBAR (KBAR) tokens and transfer them to a recipient Hedera account.
    Call this when the user wants to mint, send, or distribute KBAR tokens.
    recipient_account_id: Hedera account ID in format 0.0.XXXXXX — copy exactly
                          from the user's message. Example: '0.0.5834216'
    amount: positive float, the number of KBAR tokens to mint. Maximum 10000 per call.
            Example: 100.0 mints 100 KBAR.
    reason: short string describing why tokens are being minted.
            Example: 'conservation_milestone' or 'reward'
    """
    if not recipient_account_id or not recipient_account_id.startswith("0.0."):
        return {"error": f"Invalid recipient_account_id '{recipient_account_id}' — must be 0.0.XXXXXX"}
    if amount <= 0 or amount > 10_000:
        return {"error": "amount must be between 0 and 10000 KBAR"}
    return _run(mint_kaibar(recipient_account_id, amount, reason))


@needle.tool
def mint_conservation_nft_tool(
    recipient_account_id: str,
    conservation_id: str,
    event_type: str,
    metadata_pointer: str,
) -> dict:
    """
    Mint a Conservation NFT for a verified conservation event and send it to a recipient.
    Call this when the user wants to issue a conservation certificate or NFT.
    recipient_account_id: Hedera account ID in format 0.0.XXXXXX — copy exactly.
                          Example: '0.0.5834216'
    conservation_id: unique string ID for this conservation record.
                     Example: 'cfa-event-2026-001'
    event_type: type of conservation event as a short string.
                Must be one of: 'trees_planted', 'forest_patrol', 'cfa_milestone'
    metadata_pointer: IPFS CID or URL pointing to the off-chain metadata.
                      Example: 'ipfs://kai/conservation/event-001'
    """
    if not recipient_account_id or not recipient_account_id.startswith("0.0."):
        return {"error": f"Invalid recipient_account_id '{recipient_account_id}' — must be 0.0.XXXXXX"}
    return _run(mint_conservation_nft(
        recipient=recipient_account_id,
        conservation_id=conservation_id,
        event_type=event_type,
        metadata_pointer=metadata_pointer,
        count=1,
    ))


@needle.tool
def x402_payment_info() -> dict:
    """
    Get x402 payment configuration: route prices, supported networks (EVM + Hedera),
    treasury address, and whether payments are live or in dev mode.
    """
    return get_x402_info()


@needle.tool
def x402_pay(
    url: str,
    description: str,
    method: str = "POST",
) -> dict:
    """
    Make an OUTBOUND HTTP request to an x402-protected API endpoint and PAY for it.
    Use this ONLY when the user wants to CALL an external API and PAY the fee.
    Do NOT use this just to check payment config or prices — use x402_payment_info for that.
    Call this when the user says: 'pay for', 'call the endpoint', 'make a paid request',
    'access the API at http://...', 'execute a payment to URL', 'buy access to'.

    This tool handles the full payment cycle automatically:
      1. Sends the HTTP request
      2. If HTTP 402 received, signs the payment and retries
      3. Returns the API response and a payment receipt

    url: the full HTTP URL of the paid endpoint to call. Must start with http://
         Example: 'http://localhost:8000/agents/tx/analyse'
    description: short text explaining what this payment is for
    method: 'POST' or 'GET'. Default is 'POST'.

    LIMIT: max $1.00 USD or 5.0 HBAR per call. Daily max $10.00 USD.
    """
    from agents.x402_payer import pay_and_call, get_daily_spend

    method = method.upper()
    if method not in ("GET", "POST"):
        return {"error": "method must be GET or POST"}

    try:
        result, receipt = _run(pay_and_call(
            url=url,
            method=method,
            json_body={"description": description} if method == "POST" else None,
        ))
    except ValueError as e:
        return {"error": str(e), "spend": get_daily_spend()}
    except RuntimeError as e:
        return {"error": str(e)}
    except Exception as e:
        return {"error": f"x402 payment failed: {e}"}

    spend = get_daily_spend()
    receipt_dict = {
        "paid":          receipt.paid if receipt else False,
        "network":       receipt.network if receipt else "none",
        "payer":         receipt.payer if receipt else "",
        "amount":        receipt.amount if receipt else 0,
        "amount_unit":   receipt.amount_unit if receipt else "",
        "tx_hash":       receipt.tx_hash if receipt else "",
        "hedera_tx_id":  receipt.hedera_tx_id if receipt else "",
        "response_status": receipt.response_status if receipt else 200,
    } if receipt else {"paid": False}

    return {
        "url":          url,
        "description":  description,
        "api_response": result,
        "receipt":      receipt_dict,
        "daily_spend":  spend,
    }


@needle.tool
def x402_spend_status() -> dict:
    """
    Check the agent's current x402 payment spend for today.
    Returns accumulated USD and HBAR spend, and the configured caps.
    """
    from agents.x402_payer import get_daily_spend
    return get_daily_spend()


@needle.tool
def hedera_rails_health() -> dict:
    """
    Check Hedera rail configuration: which tokens and topics are configured,
    what network is active, and whether the operator key is set.
    """
    return {
        "network":       HEDERA_NETWORK,
        "kaibar_token":  KAIBAR_TOKEN  or "not configured",
        "connft_token":  CONNFT_TOKEN  or "not configured",
        "audit_topic":   AUDIT_TOPIC   or "not configured",
        "operator_set":  bool(os.getenv("HEDERA_OPERATOR_ID") and os.getenv("HEDERA_OPERATOR_KEY")),
    }


# ── Harness class ─────────────────────────────────────────────────────────────

# All tools registered with this harness
KAI_TOOLS = [
    hedera_account_info,
    hedera_kaibar_balance,
    hedera_transaction_history,
    hedera_hcs_audit_log,
    mint_kaibar_tokens,
    mint_conservation_nft_tool,
    x402_payment_info,
    x402_pay,
    x402_spend_status,
    hedera_rails_health,
]


class KaiNeedleHarness:
    """
    Needle 2 harness for KAI Nuvari.

    Needle 2 result structure (type: "respond"):
        result["results"]        — list of tool return values (already executed)
        result["function_calls"] — always [] in respond mode (Needle ran tools internally)
        result["text"]           — Needle's generated text response
        result["reasoning"]      — Needle's internal reasoning trace
        result["success"]        — bool
        result["confidence"]     — float

    For type: "call" (deferred execution mode):
        result["function_calls"] — list of {name, arguments} to execute manually
    """

    def __init__(self):
        self._needle = needle.Needle(tools=KAI_TOOLS)

    def run(self, query: str) -> dict:
        """
        Run a query through Needle → tool execution → response.

        Needle v2 executes tools internally and returns results directly.
        We reconstruct which tool was called by matching the result signature
        against known tool return shapes.
        """
        raw = self._needle.run(query)

        results     = raw.get("results", [])
        text        = raw.get("text", "")
        reasoning   = raw.get("reasoning", "")
        success     = raw.get("success", False)
        error       = raw.get("error")
        result_type = raw.get("type", "respond")

        # For "call" mode (deferred), function_calls has names
        function_calls = raw.get("function_calls", [])

        # Annotate each result with the tool that produced it
        annotated_results = []
        for i, res in enumerate(results):
            # Try to get tool name from function_calls (deferred mode)
            tool_name = None
            if i < len(function_calls):
                tool_name = function_calls[i].get("name") if isinstance(function_calls[i], dict) else None

            # If not available, infer from result shape (respond mode)
            if not tool_name and isinstance(res, dict):
                tool_name = _infer_tool_name(res)

            annotated_results.append({
                "tool_name": tool_name or "unknown",
                "result":    res,
            })

        return {
            "query":          query,
            "results":        annotated_results,
            "text":           text,
            "reasoning":      reasoning,
            "success":        success,
            "error":          error,
            "result_type":    result_type,
            "tool_count":     len(results),
            "engine":         "needle-2 (cactus-compute, on-device)",
            "confidence":     raw.get("confidence", 0.0),
            "prefill_tps":    raw.get("prefill_tps", 0.0),
            "decode_tps":     raw.get("decode_tps", 0.0),
        }

    def extract(self, text: str, schema) -> Any:
        return needle.extract(text, schema)

    @property
    def tools(self) -> list:
        return KAI_TOOLS


def _infer_tool_name(result: dict) -> str | None:
    """
    Infer which tool produced a result by matching its key signatures.
    Used when Needle runs in 'respond' mode and doesn't populate function_calls.
    """
    keys = set(result.keys())

    # hedera_account_info
    if "hbar" in keys and "tinybar" in keys and "account_id" in keys:
        return "hedera_account_info"
    # hedera_kaibar_balance / get_token_balance
    if "token_id" in keys and "balance" in keys and "account_id" in keys and "hbar" not in keys:
        return "hedera_kaibar_balance"
    # hedera_transaction_history
    if "transactions" in keys and "account_id" in keys:
        return "hedera_transaction_history"
    # hedera_hcs_audit_log
    if "messages" in keys and "topic_id" in keys:
        return "hedera_hcs_audit_log"
    # hedera_rails_health
    if "kaibar_token" in keys and "connft_token" in keys and "audit_topic" in keys:
        return "hedera_rails_health"
    # x402_payment_info
    if "evm" in keys and "hedera" in keys and "route_prices" in keys:
        return "x402_payment_info"
    # x402_spend_status
    if "total_usd" in keys and "total_hbar" in keys and "caps" in keys:
        return "x402_spend_status"
    # x402_pay
    if "url" in keys and "receipt" in keys and "api_response" in keys:
        return "x402_pay"
    # mint_kaibar_tokens result
    if "mintTxId" in keys or "transferTxId" in keys or (
        "simulated" in keys and "recipient" in keys
    ):
        return "mint_kaibar_tokens"
    # mint_conservation_nft_tool result
    if "serials" in keys and "recipient" in keys:
        return "mint_conservation_nft_tool"
    # error result — can't determine tool
    if keys == {"error"}:
        return None
    return None


# ── Async convenience wrapper ─────────────────────────────────────────────────

_harness: KaiNeedleHarness | None = None


def get_needle_harness() -> KaiNeedleHarness:
    """Return the shared KaiNeedleHarness singleton (lazy-initialised)."""
    global _harness
    if _harness is None:
        _harness = KaiNeedleHarness()
    return _harness


async def run_needle_agent(query: str) -> dict:
    """
    Convenience async wrapper: runs a query through the Needle harness.
    Safe to call from FastAPI endpoints.
    """
    harness = get_needle_harness()
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, harness.run, query)
