# KAI Nuvari — Hedera Deployment Reference

## Network

| Field | Value |
|---|---|
| Network | Hedera Testnet |
| Chain ID | 296 |
| Mirror Node | https://testnet.mirrornode.hedera.com |
| HashScan | https://hashscan.io/testnet |
| RPC | https://testnet.hashio.io/api |

---

## Fungible Tokens (HTS)

| Symbol | Token ID | Decimals | Rate |
|---|---|---|---|
| NVR | `0.0.10450060` | 8 | 1 HBAR = 10 NVR |
| YBOB | `0.0.10450061` | 6 | — |
| YTOKEN | `0.0.10450063` | 8 | 1 HBAR = 10 YTOKEN |
| YGOLD | `0.0.10450065` | 8 | 1 HBAR = 0.05 YGOLD |
| GAMI | `0.0.10450068` | 8 | 1 HBAR = 25 GAMI |
| CENTS | `0.0.10450070` | 6 | **1 HBAR = 1,000 CENTS** |
| KBAR | `0.0.10449901` | 6 | 1 HBAR = 2.4 KBAR |

Full registry: [`tokens/token-ids.json`](./tokens/token-ids.json)

---

## NFT Collections (HTS Non-Fungible)

| Symbol | Token ID | Purpose |
|---|---|---|
| KCNFT | `0.0.10449914` | Conservation Event NFT |
| KAIP | `0.0.10450239` | KAI Agent Passport (W3C DID) |
| KAIM | `0.0.10450242` | KAI Membership NFT |

Full registry: [`nfts/token-ids.json`](./nfts/token-ids.json)

---

## Swap Rates

PRD-mandated rates (configurable in [`/frontend/src/lib/swapRates.ts`](../frontend/src/lib/swapRates.ts)):

```
1 HBAR = 10 NVR
1 HBAR = 10 Y Token
1 HBAR = 1,000 KAI Cents
```

---

## Execution API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/hedera/swap` | POST | HTS swap (HBAR ↔ token) |
| `/api/hedera/securities/deposit` | POST | Securities HTS deposit |
| `/api/hedera/securities/withdraw` | POST | Securities HTS withdrawal |
| `/api/policies/execute` | POST | Policy execution → Hedera TX |
| `/api/hedera/swap` | GET | List available swap rates |

---

## Required Environment Variables

Add to your `.env.local`:

```bash
HEDERA_OPERATOR_ID=0.0.XXXXX
HEDERA_OPERATOR_KEY=302e...
HEDERA_NETWORK=testnet
HEDERA_AUDIT_TOPIC_ID=0.0.XXXXX

NEXT_PUBLIC_NVR_HTS_TOKEN_ID=0.0.10450060
NEXT_PUBLIC_YBOB_HTS_TOKEN_ID=0.0.10450061
NEXT_PUBLIC_YTOKEN_HTS_TOKEN_ID=0.0.10450063
NEXT_PUBLIC_YGOLD_HTS_TOKEN_ID=0.0.10450065
NEXT_PUBLIC_GAMI_HTS_TOKEN_ID=0.0.10450068
NEXT_PUBLIC_CENTS_HTS_TOKEN_ID=0.0.10450070
NEXT_PUBLIC_KAIBAR_TOKEN_ID=0.0.10449901

NEXT_PUBLIC_CONNFT_TOKEN_ID=0.0.10449914
NEXT_PUBLIC_KAIP_NFT_TOKEN_ID=0.0.10450239
NEXT_PUBLIC_KAIM_NFT_TOKEN_ID=0.0.10450242
```

---

## HashPack Integration

Connect HashPack in the app → your Hedera Account ID (e.g. `0.0.XXXXX`) is used
as the `recipientAccount` in all execution API calls. All token transfers go
to/from your connected Hedera account. The private key never leaves HashPack.
