/**
 * Minimal ABI for KAIAirdropVault — consumed by the airdrop claim UI.
 * Only the functions the UI needs are included.
 */
export const AIRDROP_ABI = [
  // view
  { name: "token",            type: "function", stateMutability: "view",       inputs: [],                                                                 outputs: [{ type: "address" }] },
  { name: "merkleRoot",       type: "function", stateMutability: "view",       inputs: [],                                                                 outputs: [{ type: "bytes32" }] },
  { name: "paused",           type: "function", stateMutability: "view",       inputs: [],                                                                 outputs: [{ type: "bool" }] },
  { name: "claimed",          type: "function", stateMutability: "view",       inputs: [{ name: "account", type: "address" }],                            outputs: [{ type: "uint256" }] },
  { name: "rootCooldown",     type: "function", stateMutability: "view",       inputs: [],                                                                 outputs: [{ type: "uint256" }] },
  { name: "rootSetAt",        type: "function", stateMutability: "view",       inputs: [],                                                                 outputs: [{ type: "uint256" }] },
  { name: "hasRole",          type: "function", stateMutability: "view",       inputs: [{ name: "role", type: "bytes32" }, { name: "account", type: "address" }], outputs: [{ type: "bool" }] },
  // write
  { name: "claim",            type: "function", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }, { name: "proof", type: "bytes32[]" }], outputs: [] },
  { name: "claimFor",         type: "function", stateMutability: "nonpayable", inputs: [{ name: "account", type: "address" }, { name: "amount", type: "uint256" }, { name: "proof", type: "bytes32[]" }], outputs: [] },
  // events
  { name: "Claimed",          type: "event", inputs: [{ name: "account", type: "address", indexed: true }, { name: "amount", type: "uint256" }] },
  { name: "RootUpdated",      type: "event", inputs: [{ name: "root", type: "bytes32", indexed: true }] },
] as const;
