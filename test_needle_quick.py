"""Quick Needle routing test — runs 9 queries, checks tool + result."""
import os, sys
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")
from dotenv import load_dotenv
load_dotenv()

import needle
from agents.needle_harness import KAI_TOOLS, KaiNeedleHarness, _infer_tool_name

OPERATOR = os.getenv("HEDERA_OPERATOR_ID", "0.0.5834216")

print("Loading Needle harness...")
harness = KaiNeedleHarness()
print(f"Tools: {len(harness.tools)}\n")

TESTS = [
    # (query, expected_tool, partial_result_key)
    ("What is the x402 payment configuration?",                      "x402_payment_info",         "evm"),
    ("Check my x402 spend for today",                                "x402_spend_status",         "total_usd"),
    ("Check Hedera rails status",                                    "hedera_rails_health",       "kaibar_token"),
    (f"What is the HBAR balance of account {OPERATOR}?",             "hedera_account_info",       "hbar"),
    (f"How much KBAR does account {OPERATOR} have?",                 "hedera_kaibar_balance",     "token_id"),
    (f"Show me the latest HCS audit log entries",                    "hedera_hcs_audit_log",      "messages"),
    (f"Show recent transaction history for account {OPERATOR}",      "hedera_transaction_history","transactions"),
    (f"Swap 25 HBAR for NVR tokens to account {OPERATOR}",           "hedera_swap_tokens",        "fromToken"),
    (f"Mint 500 NVR tokens to account {OPERATOR}",                   "mint_ecosystem_tokens",     "recipient"),
]

passed = 0
failed = 0

print(f"{'#':<3} {'Expected':<30} {'Got':<30} {'Key found':<12} Status")
print("-"*85)

for i, (query, expected, key) in enumerate(TESTS, 1):
    r = harness.run(query)
    items = r.get("results", [])
    tool_got  = items[0].get("tool_name", "?") if items else "?"
    res_data  = items[0].get("result", {}) if items else {}
    has_key   = key in res_data if isinstance(res_data, dict) else False
    has_error = "error" in res_data if isinstance(res_data, dict) else False

    ok = (tool_got == expected) and has_key and not has_error
    icon = "✅" if ok else ("⚠️ " if tool_got == expected else "❌")

    if ok:
        passed += 1
    else:
        failed += 1

    print(f"{i:<3} {expected:<30} {tool_got:<30} {str(has_key):<12} {icon}")
    if has_error:
        print(f"    ERROR: {res_data.get('error','?')[:80]}")
    elif not has_key and isinstance(res_data, dict):
        print(f"    Result keys: {list(res_data.keys())[:6]}")

print(f"\n{'='*85}")
print(f"  {passed}/{len(TESTS)} passed   {'ALL GOOD' if failed == 0 else f'{failed} need fixing'}")
print(f"{'='*85}")
sys.exit(0 if failed == 0 else 1)
