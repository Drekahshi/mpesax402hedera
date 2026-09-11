"""
test_needle.py  —  Needle harness + x402 execution diagnostics
===============================================================
Tests every Needle tool individually (direct call), then runs
Needle itself so we can see which tool it picks for each query,
and finally exercises the full x402 pay-and-call cycle.

Run:
    python test_needle.py
"""
from __future__ import annotations
import sys, os, time, asyncio, traceback
from dotenv import load_dotenv

load_dotenv()

PASS  = "✅"
FAIL  = "❌"
WARN  = "⚠️ "
SEP   = "─" * 62

def banner(title: str):
    print(f"\n{'═'*62}")
    print(f"  {title}")
    print(f"{'═'*62}")

def section(title: str):
    print(f"\n{SEP}")
    print(f"  {title}")
    print(SEP)

def result(ok: bool, label: str, detail: str = ""):
    icon = PASS if ok else FAIL
    print(f"  {icon}  {label}")
    if detail:
        for line in detail.splitlines():
            print(f"       {line}")

# ── 1. IMPORT CHECKS ─────────────────────────────────────────────────────────
banner("1 · Import checks")

imports_ok = True
for mod, label in [
    ("needle",                     "cactus-needle"),
    ("agents.needle_harness",      "needle_harness"),
    ("agents.x402_payer",          "x402_payer"),
    ("agents.x402_rails",          "x402_rails"),
    ("agents.hedera_rails",        "hedera_rails"),
    ("agents.rails",               "rails (EscrowClient)"),
    ("agents.identity",            "identity (AgentSigner)"),
]:
    try:
        __import__(mod)
        result(True, label)
    except Exception as e:
        result(False, label, str(e))
        imports_ok = False

if not imports_ok:
    print("\nFix import errors before continuing.")
    sys.exit(1)

# ── 2. ENV CHECKS ────────────────────────────────────────────────────────────
section("2 · Environment variables")

env_checks = {
    "HEDERA_OPERATOR_ID":     os.getenv("HEDERA_OPERATOR_ID", ""),
    "HEDERA_OPERATOR_KEY":    os.getenv("HEDERA_OPERATOR_KEY", "")[:8] + "..." if os.getenv("HEDERA_OPERATOR_KEY") else "",
    "HEDERA_KAIBAR_TOKEN_ID": os.getenv("HEDERA_KAIBAR_TOKEN_ID", ""),
    "HEDERA_CONNFT_TOKEN_ID": os.getenv("HEDERA_CONNFT_TOKEN_ID", ""),
    "HEDERA_AUDIT_TOPIC_ID":  os.getenv("HEDERA_AUDIT_TOPIC_ID", ""),
    "PRIVATE_KEY":            ("set (" + os.getenv("PRIVATE_KEY","")[:6] + "...)") if os.getenv("PRIVATE_KEY") else "NOT SET",
    "AGENT_PRIVATE_KEY":      ("set") if os.getenv("AGENT_PRIVATE_KEY") else "NOT SET (will fall back to PRIVATE_KEY)",
    "NEXT_PUBLIC_CENTS_ADDRESS": os.getenv("NEXT_PUBLIC_CENTS_ADDRESS","NOT SET"),
    "CHAIN_ID":               os.getenv("CHAIN_ID","11155111 (default)"),
    "SEPOLIA_RPC_URL":        os.getenv("SEPOLIA_RPC_URL","default"),
}
for k, v in env_checks.items():
    ok = bool(v and v not in ("", "NOT SET"))
    result(ok, k, v)

# ── 3. DIRECT TOOL TESTS ─────────────────────────────────────────────────────
section("3 · Direct tool function tests (no Needle model involved)")

from agents.needle_harness import (
    hedera_account_info, hedera_kaibar_balance,
    hedera_transaction_history, hedera_hcs_audit_log,
    mint_kaibar_tokens, mint_conservation_nft_tool,
    x402_payment_info, x402_pay, x402_spend_status,
    hedera_rails_health, KAI_TOOLS,
)

OPERATOR = os.getenv("HEDERA_OPERATOR_ID", "0.0.5834216")

print(f"\n  Tool count registered with Needle: {len(KAI_TOOLS)}")
for t in KAI_TOOLS:
    print(f"    • {t.__name__}")

# 3a. hedera_rails_health
print("\n  [3a] hedera_rails_health()")
try:
    r = hedera_rails_health()
    ok = isinstance(r, dict) and "network" in r
    result(ok, "hedera_rails_health", str(r))
except Exception as e:
    result(False, "hedera_rails_health", traceback.format_exc())

# 3b. x402_payment_info
print("\n  [3b] x402_payment_info()")
try:
    r = x402_payment_info()
    ok = isinstance(r, dict) and "evm" in r and "hedera" in r
    result(ok, "x402_payment_info returns EVM+Hedera blocks", "")
    print(f"       EVM dev_mode : {r['evm'].get('dev_mode')}")
    print(f"       Hedera enabled: {r['hedera'].get('enabled')}")
    print(f"       Routes priced : {len(r.get('route_prices', {}))}")
except Exception as e:
    result(False, "x402_payment_info", traceback.format_exc())

# 3c. x402_spend_status
print("\n  [3c] x402_spend_status()")
try:
    r = x402_spend_status()
    ok = isinstance(r, dict) and "total_usd" in r and "caps" in r
    result(ok, "x402_spend_status", str(r))
except Exception as e:
    result(False, "x402_spend_status", traceback.format_exc())

# 3d. hedera_account_info  (operator account — should always work)
print(f"\n  [3d] hedera_account_info('{OPERATOR}')")
try:
    r = hedera_account_info(OPERATOR)
    ok = "error" not in r and ("hbar" in r or "account_id" in r)
    result(ok, "hedera_account_info", f"hbar={r.get('hbar','?')}  tokens={len(r.get('tokens',[]))}")
except Exception as e:
    result(False, "hedera_account_info", traceback.format_exc())

# 3e. hedera_kaibar_balance
print(f"\n  [3e] hedera_kaibar_balance('{OPERATOR}')")
try:
    r = hedera_kaibar_balance(OPERATOR)
    ok = "error" not in r
    bal = r.get("balance", r.get("error", "?"))
    result(ok, "hedera_kaibar_balance", f"balance raw={bal}  (÷1e6 = {bal/1e6:,.0f} KBAR)" if isinstance(bal,(int,float)) and ok else str(r))
except Exception as e:
    result(False, "hedera_kaibar_balance", traceback.format_exc())

# 3f. hedera_transaction_history
print(f"\n  [3f] hedera_transaction_history('{OPERATOR}', limit=3)")
try:
    r = hedera_transaction_history(OPERATOR, limit=3)
    ok = "error" not in r and "transactions" in r
    txs = r.get("transactions", [])
    result(ok, "hedera_transaction_history", f"{len(txs)} transactions returned")
    if txs:
        print(f"       Latest: {txs[0].get('type','?')} at {txs[0].get('consensus_timestamp','?')[:20]}")
except Exception as e:
    result(False, "hedera_transaction_history", traceback.format_exc())

# 3g. hedera_hcs_audit_log
print("\n  [3g] hedera_hcs_audit_log(limit=3)")
try:
    r = hedera_hcs_audit_log(limit=3)
    ok = "error" not in r and "messages" in r
    msgs = r.get("messages", [])
    result(ok, "hedera_hcs_audit_log", f"{len(msgs)} messages from topic {r.get('topic_id','?')}")
    if msgs:
        print(f"       Latest seq: {msgs[0].get('sequence_number','?')}")
        print(f"       Message   : {msgs[0].get('message','')[:80]}")
except Exception as e:
    result(False, "hedera_hcs_audit_log", traceback.format_exc())

# ── 4. X402 SIGNER UNIT TEST ─────────────────────────────────────────────────
section("4 · X402PaymentSigner unit test (no broadcast)")

from agents.x402_payer import (
    X402PaymentSigner, build_payment_header,
    build_hedera_payment_headers, get_daily_spend,
    _check_caps
)

print("\n  [4a] X402PaymentSigner init from PRIVATE_KEY")
signer = None
try:
    signer = X402PaymentSigner()
    result(True, f"Signer address: {signer.address}", "")
except Exception as e:
    result(False, "X402PaymentSigner init", str(e))
    print(f"\n  {WARN} PRIVATE_KEY not usable for EVM signing — x402_pay tool will fail on EVM path.")
    print("       The Hedera path will still work (uses operator key in Next.js).")

if signer:
    print("\n  [4b] sign_transfer_with_authorization()")
    try:
        token_addr = "0x1bd79052747A236Aca137380394da27771e95eeA"  # CENTS
        auth = signer.sign_transfer_with_authorization(
            token_address=token_addr,
            token_name="Nuvari Cents",
            to="0xB13727161583e38185530755a1A96D00fcCae870",
            value=100,
            valid_before=int(time.time()) + 300,
        )
        ok = "signature" in auth and auth["signature"].startswith("0x")
        result(ok, "EIP-712 TransferWithAuthorization signed",
               f"sig={auth['signature'][:20]}...  from={auth['from']}")

        print("\n  [4c] build_payment_header()")
        header = build_payment_header({**auth})
        ok2 = isinstance(header, str) and len(header) > 50
        result(ok2, f"X-PAYMENT header built ({len(header)} chars)", header[:60] + "...")
    except Exception as e:
        result(False, "sign_transfer_with_authorization", traceback.format_exc())

print("\n  [4d] build_hedera_payment_headers()")
try:
    h = build_hedera_payment_headers(OPERATOR)
    ok = h.get("X-PAYMENT-NETWORK") == "hedera" and "X-HEDERA-PAYER" in h
    result(ok, "Hedera payment headers", str(h))
except Exception as e:
    result(False, "build_hedera_payment_headers", traceback.format_exc())

print("\n  [4e] spend cap enforcement")
try:
    _check_caps(amount_usd=0.50)
    result(True, "Cap check $0.50 USD — allowed", "")
    try:
        _check_caps(amount_usd=999.0)
        result(False, "Cap check $999 USD should have raised", "")
    except ValueError as e:
        result(True, "Cap check $999 USD — correctly blocked", str(e))
    try:
        _check_caps(amount_hbar=10.0)
        result(False, "Cap check 10 HBAR should have raised", "")
    except ValueError as e:
        result(True, "Cap check 10 HBAR — correctly blocked", str(e))
except Exception as e:
    result(False, "Cap enforcement", traceback.format_exc())

print("\n  [4f] get_daily_spend()")
try:
    s = get_daily_spend()
    result(True, "Daily spend tracker", str(s))
except Exception as e:
    result(False, "get_daily_spend", traceback.format_exc())

# ── 5. X402 FULL CYCLE (against local server if running) ─────────────────────
section("5 · x402_pay tool — full 402→sign→retry cycle")

AGENT_URL = "http://127.0.0.1:8000"

import httpx as _httpx
server_up = False
try:
    r = _httpx.get(f"{AGENT_URL}/health", timeout=3)
    server_up = r.status_code == 200
except Exception:
    pass

if not server_up:
    print(f"\n  {WARN} FastAPI server not running at {AGENT_URL}")
    print("       Start it with:  uvicorn server:app --host 127.0.0.1 --port 8000")
    print("       Skipping live x402 round-trip test.")
else:
    print(f"\n  Server at {AGENT_URL} — running live tests\n")

    # 5a. Hit a free (unprotected) endpoint
    print("  [5a] GET /health  (no payment required)")
    try:
        r = _httpx.get(f"{AGENT_URL}/health", timeout=5)
        result(r.status_code == 200, f"GET /health → {r.status_code}", str(r.json())[:80])
    except Exception as e:
        result(False, "GET /health", str(e))

    # 5b. Hit a paid route WITHOUT payment — should get 402
    print("\n  [5b] POST /agents/tx/analyse without X-PAYMENT (expect 402)")
    try:
        r = _httpx.post(f"{AGENT_URL}/agents/tx/analyse",
                        json={"tx_hash": "0x0000"}, timeout=5)
        if r.status_code == 402:
            body = r.json()
            result(True, "Got HTTP 402 as expected",
                   f"accepts count: {len(body.get('detail',{}).get('accepts',[]))}")
        elif r.status_code == 200:
            result(True, "Got 200 (x402 in dev_mode — no payment token configured)",
                   "Set NEXT_PUBLIC_CENTS_ADDRESS or USDC_SEPOLIA_ADDRESS to enable live x402")
        else:
            result(False, f"Unexpected status {r.status_code}", r.text[:200])
    except Exception as e:
        result(False, "POST /agents/tx/analyse", str(e))

    # 5c. x402_pay tool — let Needle/payer do the full cycle
    print("\n  [5c] x402_pay tool — automated 402→sign→retry")
    try:
        r_tool = x402_pay(
            url=f"{AGENT_URL}/agents/x402/info",
            description="test x402 pay tool execution",
            method="GET",
        )
        # /agents/x402/info is unprotected so no payment needed
        ok = "error" not in r_tool or r_tool.get("api_response")
        result(ok, "x402_pay against /agents/x402/info",
               f"paid={r_tool.get('receipt',{}).get('paid')}  status={r_tool.get('receipt',{}).get('response_status')}")
        print(f"       daily_spend: {r_tool.get('daily_spend',{})}")
    except Exception as e:
        result(False, "x402_pay tool", traceback.format_exc())

    # 5d. GET /agents/x402/spend via the endpoint
    print("\n  [5d] GET /agents/x402/spend endpoint")
    try:
        r = _httpx.get(f"{AGENT_URL}/agents/x402/spend", timeout=5)
        result(r.status_code == 200, f"GET /agents/x402/spend → {r.status_code}", str(r.json()))
    except Exception as e:
        result(False, "GET /agents/x402/spend", str(e))

    # 5e. POST /agents/x402/sign (sign without paying)
    print("\n  [5e] POST /agents/x402/sign — sign a TransferWithAuthorization")
    if signer:
        try:
            r = _httpx.post(f"{AGENT_URL}/agents/x402/sign",
                            json={
                                "token_address": "0x1bd79052747A236Aca137380394da27771e95eeA",
                                "token_name":    "Nuvari Cents",
                                "to":            "0xB13727161583e38185530755a1A96D00fcCae870",
                                "value":         100,
                            }, timeout=5)
            ok = r.status_code == 200 and "x_payment_header" in r.json()
            result(ok, f"POST /agents/x402/sign → {r.status_code}",
                   f"header length: {len(r.json().get('x_payment_header',''))} chars" if ok else r.text[:200])
        except Exception as e:
            result(False, "POST /agents/x402/sign", str(e))
    else:
        print(f"  {WARN} Skipping — no signer (PRIVATE_KEY not set)")

    # 5f. Needle /agents/needle/health
    print("\n  [5f] GET /agents/needle/health")
    try:
        r = _httpx.get(f"{AGENT_URL}/agents/needle/health", timeout=8)
        result(r.status_code == 200, f"GET /agents/needle/health → {r.status_code}",
               str(r.json())[:200])
    except Exception as e:
        result(False, "GET /agents/needle/health", str(e))

# ── 6. NEEDLE MODEL TOOL ROUTING ─────────────────────────────────────────────
section("6 · Needle model — tool routing (on-device, no API key)")

print("\n  Loading Needle model (downloads ~14MB on first run)...\n")

from agents.needle_harness import KaiNeedleHarness

try:
    harness = KaiNeedleHarness()
    result(True, "KaiNeedleHarness initialised", f"Tools: {len(harness.tools)}")
except Exception as e:
    result(False, "KaiNeedleHarness init", traceback.format_exc())
    print("\nCannot run Needle tests without the model.")
    sys.exit(1)

# Each query should route to a specific tool
NEEDLE_QUERIES = [
    ("What is the x402 payment configuration?",         "x402_payment_info",      False),
    ("Check my x402 spend for today",                   "x402_spend_status",      False),
    ("Check Hedera rails status",                       "hedera_rails_health",    False),
    (f"What is the HBAR balance of {OPERATOR}?",        "hedera_account_info",    False),
    (f"How much KBAR does {OPERATOR} have?",            "hedera_kaibar_balance",  False),
    ("Show me the latest HCS audit log entries",        "hedera_hcs_audit_log",   False),
    (f"Show transaction history for {OPERATOR}",        "hedera_transaction_history", False),
]

print(f"  {'Query':<52} {'Expected tool':<30} {'Routed to':<30} Status")
print("  " + "-"*118)

all_routes_ok = True
for query, expected_tool, _skip in NEEDLE_QUERIES:
    try:
        r = harness.run(query)
        results_list = r.get("results", [])
        routed_to    = results_list[0].get("tool_name", "?") if results_list else "(no tool called)"
        text         = r.get("text", "")[:50]
        ok           = routed_to == expected_tool
        if not ok:
            all_routes_ok = False
        icon = PASS if ok else WARN
        q_short = (query[:49] + "…") if len(query) > 50 else query
        print(f"  {icon}  {q_short:<50} {expected_tool:<30} {routed_to:<30}")
        if results_list:
            tool_result = results_list[0]
            res_preview = str(tool_result.get("result", ""))[:60]
            print(f"         Result preview: {res_preview}")
    except Exception as e:
        print(f"  {FAIL}  {query[:50]:<50} {expected_tool:<30} ERROR: {str(e)[:40]}")
        all_routes_ok = False

print()
result(all_routes_ok, "All Needle tool routes correct" if all_routes_ok
       else "Some routes mismatched (check docstrings — Needle uses them for routing)")

# ── 7. x402_pay VIA NEEDLE ───────────────────────────────────────────────────
section("7 · x402_pay routed through Needle")

print("\n  Query: 'Pay for the x402 info endpoint at http://127.0.0.1:8000/agents/x402/info'")
try:
    r = harness.run(
        "Use x402_pay to call the endpoint http://127.0.0.1:8000/agents/x402/info "
        "with method GET and description 'needle routing test'"
    )
    results_list = r.get("results", [])
    routed = results_list[0].get("tool_name", "?") if results_list else "(none)"
    ok = routed in ("x402_pay", "x402_payment_info")
    result(ok, f"Needle routed to: {routed}", "")
    if results_list:
        tool_result_data = results_list[0].get("result", {})
        print(f"       receipt.paid      : {tool_result_data.get('receipt',{}).get('paid','?')}")
        print(f"       response_status   : {tool_result_data.get('receipt',{}).get('response_status','?')}")
        print(f"       daily_spend.usd   : {tool_result_data.get('daily_spend',{}).get('total_usd','?')}")
except Exception as e:
    result(False, "x402_pay via Needle", traceback.format_exc())

# ── 8. FINAL SUMMARY ─────────────────────────────────────────────────────────
banner("Test run complete")

missing_for_live = []
if not os.getenv("NEXT_PUBLIC_CENTS_ADDRESS") and not os.getenv("USDC_SEPOLIA_ADDRESS"):
    missing_for_live.append("NEXT_PUBLIC_CENTS_ADDRESS — needed for EVM x402 live payments")
if not os.getenv("GROQ_API_KEY") or os.getenv("GROQ_API_KEY","").startswith("your_"):
    missing_for_live.append("GROQ_API_KEY — needed for AI responses (not for Needle tool routing)")
if not server_up:
    missing_for_live.append("FastAPI server — needed for /agents/* endpoint tests")

if missing_for_live:
    print(f"\n  {WARN} To enable all features, set:")
    for m in missing_for_live:
        print(f"     • {m}")
else:
    print("\n  All systems go. Needle x402 execution is fully functional.")
