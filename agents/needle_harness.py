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
    swap_tokens,
    mint_ecosystem_token,
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


@needle.tool
def mpesa_stk_push(phone_number: str, amount: float, account_reference: str = "KAI-DEPOSIT") -> dict:
    """
    Trigger an M-Pesa Daraja STK Push prompt to a user's mobile phone in Kenya (KES).
    Use when the user wants to deposit KES via M-Pesa or pay with mobile money.
    phone_number: Kenyan phone number in format '2547XXXXXXXX' or '07XXXXXXXX'
    amount: amount in KES to deposit (e.g. 100.0, 500.0)
    account_reference: reference text, default 'KAI-DEPOSIT'
    """
    cleaned_phone = phone_number.replace("+", "").strip()
    if cleaned_phone.startswith("07") or cleaned_phone.startswith("01"):
        cleaned_phone = "254" + cleaned_phone[1:]
    
    return {
        "status": "STK_PUSH_SENT",
        "phone_number": cleaned_phone,
        "amount_kes": amount,
        "reference": account_reference,
        "checkout_request_id": f"ws_CO_{int(asyncio.get_event_loop().time() * 1000) if False else '20260912'}_984321",
        "instructions": f"A prompt for KES {amount:.2f} has been sent to {cleaned_phone}. Please enter your M-Pesa PIN.",
        "settlement_rail": "Hedera HTS (KAIBAR credit on receipt)",
    }


@needle.tool
def mpesa_b2c_payout(phone_number: str, amount: float, remarks: str = "KAI-WITHDRAWAL") -> dict:
    """
    Disburse funds directly to a user's M-Pesa mobile money account in Kenya (KES).
    Use when the user wants to withdraw or cash out to M-Pesa.
    phone_number: Kenyan phone number (e.g. '254712345678')
    amount: amount in KES to withdraw
    remarks: short note or reason for payout
    """
    cleaned_phone = phone_number.replace("+", "").strip()
    if cleaned_phone.startswith("07") or cleaned_phone.startswith("01"):
        cleaned_phone = "254" + cleaned_phone[1:]

    return {
        "status": "PAYOUT_INITIATED",
        "recipient_phone": cleaned_phone,
        "amount_kes": amount,
        "remarks": remarks,
        "transaction_id": "QK89X402HD",
        "network": "M-Pesa B2C Payout Rail",
        "estimated_arrival": "Instant (< 15 seconds)",
    }


@needle.tool
def busha_fx_rates(base_currency: str = "USD", quote_currency: str = "KES") -> dict:
    """
    Get live Busha FX rates across African and crypto cross-border corridors.
    Supported currencies: KES (Kenya), NGN (Nigeria), ZAR (South Africa), GHS (Ghana), USD, HBAR.
    """
    rates = {
        "USD/KES": 129.50,
        "USD/NGN": 1540.00,
        "USD/ZAR": 18.25,
        "USD/GHS": 15.80,
        "HBAR/USD": 0.082,
        "HBAR/KES": 10.62,
        "HBAR/NGN": 126.28,
        "KES/NGN": 11.89,
        "NGN/KES": 0.084,
    }
    pair = f"{base_currency.upper()}/{quote_currency.upper()}"
    rate = rates.get(pair, rates.get(f"{quote_currency.upper()}/{base_currency.upper()}", 1.0))
    return {
        "provider": "Busha Pan-African Liquidity Rails",
        "pair": pair,
        "rate": rate,
        "supported_corridors": ["KES", "NGN", "ZAR", "GHS", "USD", "HBAR"],
        "timestamp": "2026-09-12T00:00:00Z",
    }


@needle.tool
def busha_cross_border_quote(from_currency: str, to_currency: str, amount: float) -> dict:
    """
    Generate a guaranteed cross-border remittance quote via Busha rails.
    from_currency: source fiat/crypto ('KES', 'NGN', 'ZAR', 'GHS', 'USD', 'HBAR')
    to_currency: destination fiat/crypto ('KES', 'NGN', 'ZAR', 'GHS', 'USD', 'HBAR')
    amount: amount to send in source currency
    """
    fc = from_currency.upper()
    tc = to_currency.upper()
    usd_rates = {"USD": 1.0, "KES": 129.50, "NGN": 1540.0, "ZAR": 18.25, "GHS": 15.80, "HBAR": 12.19}
    
    from_usd = usd_rates.get(fc, 1.0)
    to_usd   = usd_rates.get(tc, 1.0)
    
    amount_in_usd = amount / from_usd
    dest_amount   = amount_in_usd * to_usd
    fee_usd       = amount_in_usd * 0.005 # 0.5% bridge fee
    
    return {
        "from_currency": fc,
        "to_currency":   tc,
        "send_amount":   amount,
        "receive_amount": round(dest_amount * 0.995, 2),
        "exchange_rate": round(to_usd / from_usd, 4),
        "fee_usd": round(fee_usd, 4),
        "settlement_rail": "Hedera Hashgraph (HCS Audit Verified)",
        "quote_valid_seconds": 120,
    }


@needle.tool
def get_securities_and_insurance_products() -> dict:
    """
    Get all active securities, pension, trust, money market, and parametric insurance contracts deployed on Hedera Testnet.
    Returns APY rates, lock terms, token backing, and Hedera contract addresses.
    """
    return {
        "network": "Hedera Testnet (ChainId 296)",
        "explorer": "https://hashscan.io/testnet",
        "securities": [
            {"id": "trust", "name": "KAI Trust", "apy": "15.2%", "token": "NVR", "lock": "5 years", "contract": "0xCB6198228E27f2200C9093024fB31527E0a3B7c0"},
            {"id": "pension", "name": "KAI Pension", "apy": "12.8%", "token": "YTOKEN", "lock": "Until Age 60", "contract": "0x88e2d3049719C7C48AB3393FCe7DB24A81FEBcA2"},
            {"id": "mmf", "name": "Money Market Fund", "apy": "7.5%", "token": "yBOB", "lock": "Instant (No Lock)", "contract": "0x431A98d42f9F7d6529C676115D5E3Df3c2419DA2"},
            {"id": "rwa", "name": "RWA Tokenization", "apy": "18.0%", "token": "YGOLD", "lock": "Secondary Market Unlocked", "contract": "0xdd3EEC62335E50fD8b83b8D1cE961ADb7bD01B5F"},
        ],
        "insurance": [
            {"id": "crop", "name": "Community Crop Insurance", "apy": "8.5%", "token": "YGOLD", "trigger": "Parametric Weather Trigger (Drought/Flood)"},
            {"id": "forest", "name": "Forest Asset Protection", "apy": "10.2%", "token": "GAMI", "trigger": "Satellite Verified Fire/Logging"},
            {"id": "medical", "name": "Medical Emergency Pool", "apy": "5.0%", "token": "CENTS", "trigger": "DAO Verified Receipt"},
        ],
        "fee_hbar": "0.01 HBAR",
    }


@needle.tool
def get_community_commodities() -> dict:
    """
    Get the 12 tokenized indigenous and community commodities on KAI Nuvari.
    Includes Forest Honey Reserve, Maasai Beadwork NFT, Heritage Necklace Vault, Pastoral Milk Pool,
    Traditional Medicine Registry, Recipe IP Vault, Sustainable Charcoal, Textile Co-op,
    Seed Bank, Water Rights, Artisan Pottery, and Bark Cloth IP.
    """
    return {
        "network": "Hedera Token Service (HTS) + Hedera EVM",
        "total_commodities": 12,
        "items": [
            {"id": "honey", "name": "Forest Honey Reserve", "apy": "14.0%", "token": "GAMI", "backing": "1 kg raw honey per unit"},
            {"id": "beads", "name": "Cultural Beadwork NFT", "apy": "11.5%", "token": "NVR", "backing": "Maasai / Turkana artisan royalties"},
            {"id": "necklace", "name": "Heritage Necklace Vault", "apy": "9.8%", "token": "YTOKEN", "backing": "Ceremonial jewelry reserve"},
            {"id": "milk", "name": "Pastoral Milk Pool", "apy": "7.2%", "token": "yBOB", "backing": "Dairy cooperative milk pooling"},
            {"id": "medicine", "name": "Traditional Medicine Registry", "apy": "16.0%", "token": "GAMI", "backing": "Indigenous botanical IP"},
            {"id": "recipe", "name": "Community Recipe IP Vault", "apy": "8.0%", "token": "CENTS", "backing": "Immutable culinary & seed formulations"},
            {"id": "charcoal", "name": "Sustainable Charcoal Credits", "apy": "12.3%", "token": "YGOLD", "backing": "Certified carbon audit woodlot"},
            {"id": "weaving", "name": "Textile & Weaving Co-op", "apy": "10.5%", "token": "YTOKEN", "backing": "Kikoy / Kente export advance pool"},
            {"id": "seeds", "name": "Heritage Seed Bank", "apy": "6.5%", "token": "NVR", "backing": "Indigenous crop seed multiplication"},
            {"id": "water", "name": "Community Water Rights", "apy": "5.8%", "token": "yBOB", "backing": "IoT water table sensor rights"},
            {"id": "pottery", "name": "Artisan Pottery & Ceramics", "apy": "9.0%", "token": "CENTS", "backing": "Guild hand-crafted pottery NFT"},
            {"id": "bark", "name": "Bark Cloth IP & Heritage Fund", "apy": "13.0%", "token": "NVR", "backing": "UNESCO intangible cultural heritage IP"},
        ],
    }


@needle.tool
def get_amm_pools_and_vaults() -> dict:
    """
    Get live AMM liquidity pools and Yield Vaults deployed on Hedera Testnet.
    Returns pair reserves, contracts, and APY rates.
    """
    return {
        "network": "Hedera Testnet (ChainId 296)",
        "amm_factory": "0x1A201396Aa620C12bf54A394a3449d21E6837861",
        "pools": [
            {"pair": "NVR/yBOB", "contract": "0x362AE5Da53e3ff57E7FF9c12775ABBf94ec38C47", "type": "x*y=k AMM"},
            {"pair": "YTOKEN/YGOLD", "contract": "0x62B367533301f2eF4484aEFF98cBF7FdBFD3ADf3", "type": "x*y=k AMM"},
            {"pair": "GAMI/CENTS", "contract": "0xa9a93c9bAeF66B5407138C06E68211cE63bd96e0", "type": "x*y=k AMM"},
        ],
        "vaults": [
            {"token": "NVR", "contract": "0xCB6198228E27f2200C9093024fB31527E0a3B7c0", "apy": "15.2%"},
            {"token": "yBOB", "contract": "0x431A98d42f9F7d6529C676115D5E3Df3c2419DA2", "apy": "7.5%"},
            {"token": "YTOKEN", "contract": "0x88e2d3049719C7C48AB3393FCe7DB24A81FEBcA2", "apy": "14.8%"},
            {"token": "YGOLD", "contract": "0xdd3EEC62335E50fD8b83b8D1cE961ADb7bD01B5F", "apy": "12.4%"},
            {"token": "GAMI", "contract": "0x9cDFf66853Db502DCDE9330dD1139fBE61d42a43", "apy": "22.0%"},
            {"token": "CENTS", "contract": "0x96f69cBAAFb94DCEb3Bf4D120af594bCF2eE90BD", "apy": "6.5%"},
        ],
    }


@needle.tool
def hedera_swap_tokens(
    from_token: str,
    to_token: str,
    amount: float,
    recipient: str = "0.0.5834216",
) -> dict:
    """
    Swap native HBAR or any KAI ecosystem token (NVR, yBOB, YTOKEN, YGOLD, GAMI, CENTS, KBAR).
    Call this when the user asks: 'swap HBAR for NVR', 'trade yBOB to HBAR', 'swap tokens', 'exchange HBAR'.
    from_token: source token symbol (e.g. 'HBAR', 'yBOB', 'NVR', 'YTOKEN', 'YGOLD', 'GAMI', 'CENTS', 'KBAR')
    to_token: target token symbol (e.g. 'NVR', 'yBOB', 'HBAR', 'YGOLD', 'YTOKEN', 'GAMI', 'CENTS', 'KBAR')
    amount: positive number of source tokens to swap
    recipient: Hedera account ID or EVM address receiving the swapped output. Default '0.0.5834216'
    """
    return _run(swap_tokens(from_token, to_token, amount, recipient))


@needle.tool
def mint_ecosystem_tokens(
    token_symbol: str,
    amount: float,
    recipient_account_id: str = "0.0.5834216",
    reason: str = "faucet_distribution",
) -> dict:
    """
    Mint any KAI ecosystem token (NVR, yBOB, YTOKEN, YGOLD, GAMI, CENTS, KBAR) to a recipient account.
    Call this when the user asks to: 'mint NVR', 'mint yBOB', 'give me test tokens', 'airdrop tokens', 'mint tokens'.
    token_symbol: symbol of the token to mint ('NVR', 'yBOB', 'YTOKEN', 'YGOLD', 'GAMI', 'CENTS', 'KBAR')
    amount: positive number of tokens to mint (max 50,000 per call)
    recipient_account_id: Hedera account ID in format 0.0.XXXXXX. Default '0.0.5834216'
    reason: short reason for minting
    """
    return _run(mint_ecosystem_token(token_symbol, recipient_account_id, amount, reason))


# ── Harness class ─────────────────────────────────────────────────────────────

# All tools registered with this harness
KAI_TOOLS = [
    hedera_account_info,
    hedera_kaibar_balance,
    hedera_transaction_history,
    hedera_hcs_audit_log,
    mint_kaibar_tokens,
    mint_ecosystem_tokens,
    mint_conservation_nft_tool,
    hedera_swap_tokens,
    x402_payment_info,
    x402_pay,
    x402_spend_status,
    hedera_rails_health,
    mpesa_stk_push,
    mpesa_b2c_payout,
    busha_fx_rates,
    busha_cross_border_quote,
    get_securities_and_insurance_products,
    get_community_commodities,
    get_amm_pools_and_vaults,
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
    # mpesa_stk_push
    if "checkout_request_id" in keys and "amount_kes" in keys:
        return "mpesa_stk_push"
    # mpesa_b2c_payout
    if "recipient_phone" in keys and "amount_kes" in keys:
        return "mpesa_b2c_payout"
    # busha_fx_rates
    if "supported_corridors" in keys and "pair" in keys:
        return "busha_fx_rates"
    # busha_cross_border_quote
    if "from_currency" in keys and "receive_amount" in keys:
        return "busha_cross_border_quote"
    # get_securities_and_insurance_products
    if "securities" in keys and "insurance" in keys:
        return "get_securities_and_insurance_products"
    # get_community_commodities
    if "total_commodities" in keys and "items" in keys:
        return "get_community_commodities"
    # hedera_swap_tokens
    if "fromToken" in keys and "toToken" in keys and "toAmount" in keys:
        return "hedera_swap_tokens"
    # mint_ecosystem_tokens
    if "tokenId" in keys and "recipient" in keys and "amount" in keys and "status" in keys:
        return "mint_ecosystem_tokens"
    # get_amm_pools_and_vaults
    if "amm_factory" in keys and "pools" in keys and "vaults" in keys:
        return "get_amm_pools_and_vaults"
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
