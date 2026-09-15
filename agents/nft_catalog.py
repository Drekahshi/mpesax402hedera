"""
agents/nft_catalog.py
Static Conservation NFT catalog for the voice/chat purchase demo.

Prices are deliberately small (well under X402_MAX_HBAR_PER_TX, default 5.0
HBAR) so a voice purchase never needs a cap increase to work on testnet.

Real product data would come from a DB; this is scoped to what the PRD's
demo script needs: "Buy me Conservation NFT #24" must resolve to a real
priced, mintable item.
"""

from __future__ import annotations

CONSERVATION_NFTS: dict[str, dict] = {
    "24": {
        "name": "Oloolua Forest Conservation NFT #24",
        "price_hbar": 2.0,
        "metadata_pointer": "ipfs://kai-conservation/oloolua/24.json",
        "description": "Protects one hectare of the Oloolua Forest CFA reserve.",
    },
    "1": {
        "name": "Leopard Lookout",
        "price_hbar": 1.5,
        "metadata_pointer": "ipfs://kai-conservation/leopard-lookout/1.json",
        "description": "A young leopard peering over a rocky ledge at sunset.",
    },
    "5": {
        "name": "Ghost Bird",
        "price_hbar": 3.0,
        "metadata_pointer": "ipfs://kai-conservation/ghost-bird/5.json",
        "description": "A long-tailed bird gliding through a dark misty forest.",
    },
    "11": {
        "name": "Elephant in Mist",
        "price_hbar": 4.2,
        "metadata_pointer": "ipfs://kai-conservation/elephant-in-mist/11.json",
        "description": "An elephant crossing a misty river at dawn.",
    },
}


def get_nft(nft_id: str) -> dict | None:
    return CONSERVATION_NFTS.get(str(nft_id).strip())


def price_tinybar(nft_id: str) -> int | None:
    nft = get_nft(nft_id)
    if not nft:
        return None
    return int(round(nft["price_hbar"] * 1e8))
