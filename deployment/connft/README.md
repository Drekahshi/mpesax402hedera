# Conservation NFT (CoNNFT) Collection Registry

This directory contains the token configuration and metadata registry for the **Conservation Event NFT (KCNFT)** on Hedera Testnet.

## Collection Overview

- **Name**: Conservation Event NFT
- **Symbol**: `KCNFT`
- **Hedera Token ID**: `0.0.10449914`
- **Network**: Hedera Testnet (`chain-id: 296`)
- **Type**: `NON_FUNGIBLE_UNIQUE`
- **Total Serial Assets**: 105
- **Primary Pricing**: `yBOB` & `HBAR`
- **Explorer**: [HashScan 0.0.10449914](https://hashscan.io/testnet/token/0.0.10449914)
- **Environment Variable**: `NEXT_PUBLIC_CONNFT_TOKEN_ID=0.0.10449914`

## Files

- [`token-id.json`](./token-id.json) — Token ID, network details, schema, and treasury settings.
- [`metadata.json`](./metadata.json) — Item registry with names, prices, descriptions, image paths, and HashScan URLs.

## HIP-412 Metadata Format

Every minted conservation serial adheres to the standard HIP-412 schema:

```json
{
  "name": "Leopard Lookout #1",
  "creator": "KAI Nuvari Conservation DAO",
  "description": "A young leopard peering over a rocky ledge at sunset.",
  "image": "ipfs://<CID>/nft1.jpeg",
  "type": "image/jpeg",
  "attributes": [
    { "trait_type": "Conservation Type", "value": "Wildlife Protection" },
    { "trait_type": "Location", "value": "Tsavo East, Kenya" },
    { "trait_type": "Serial", "value": 1 },
    { "trait_type": "Verified By", "value": "Kenya Forest Service CFA" }
  ]
}
```
