/**
 * Minimal ABIs for KaiVault, KaiPool and KaiAMM — consumed by the vaults and
 * pools pages. Only the functions the UI actually calls are included.
 */

// ─── KaiVault ────────────────────────────────────────────────────────────────
export const VAULT_ABI = [
  // view
  { name: "totalAssets",    type: "function", stateMutability: "view",       inputs: [],                                             outputs: [{ type: "uint256" }] },
  { name: "totalSupply",    type: "function", stateMutability: "view",       inputs: [],                                             outputs: [{ type: "uint256" }] },
  { name: "balanceOf",      type: "function", stateMutability: "view",       inputs: [{ name: "account", type: "address" }],         outputs: [{ type: "uint256" }] },
  { name: "sharePrice",     type: "function", stateMutability: "view",       inputs: [],                                             outputs: [{ type: "uint256" }] },
  { name: "apyBps",         type: "function", stateMutability: "view",       inputs: [],                                             outputs: [{ type: "uint256" }] },
  { name: "previewDeposit", type: "function", stateMutability: "view",       inputs: [{ name: "assets",  type: "uint256" }],         outputs: [{ type: "uint256" }] },
  { name: "previewWithdraw",type: "function", stateMutability: "view",       inputs: [{ name: "shares",  type: "uint256" }],         outputs: [{ type: "uint256" }] },
  { name: "asset",          type: "function", stateMutability: "view",       inputs: [],                                             outputs: [{ type: "address" }] },
  // write
  { name: "deposit",        type: "function", stateMutability: "nonpayable", inputs: [{ name: "assets",  type: "uint256" }],         outputs: [{ type: "uint256" }] },
  { name: "withdraw",       type: "function", stateMutability: "nonpayable", inputs: [{ name: "shares",  type: "uint256" }],         outputs: [{ type: "uint256" }] },
  // events
  { name: "Deposited",  type: "event", inputs: [{ name: "user",   type: "address", indexed: true }, { name: "assets", type: "uint256" }, { name: "shares", type: "uint256" }] },
  { name: "Withdrawn",  type: "event", inputs: [{ name: "user",   type: "address", indexed: true }, { name: "shares", type: "uint256" }, { name: "assets", type: "uint256" }] },
] as const;

// ─── KaiPool ─────────────────────────────────────────────────────────────────
export const POOL_ABI = [
  // view
  { name: "tokenA",        type: "function", stateMutability: "view",       inputs: [],                                                                                         outputs: [{ type: "address" }] },
  { name: "tokenB",        type: "function", stateMutability: "view",       inputs: [],                                                                                         outputs: [{ type: "address" }] },
  { name: "reserveA",      type: "function", stateMutability: "view",       inputs: [],                                                                                         outputs: [{ type: "uint256" }] },
  { name: "reserveB",      type: "function", stateMutability: "view",       inputs: [],                                                                                         outputs: [{ type: "uint256" }] },
  { name: "totalSupply",   type: "function", stateMutability: "view",       inputs: [],                                                                                         outputs: [{ type: "uint256" }] },
  { name: "balanceOf",     type: "function", stateMutability: "view",       inputs: [{ name: "account", type: "address" }],                                                     outputs: [{ type: "uint256" }] },
  { name: "getAmountOut",  type: "function", stateMutability: "view",       inputs: [{ name: "tokenIn", type: "address" }, { name: "amtIn", type: "uint256" }],                 outputs: [{ type: "uint256" }] },
  { name: "spotPrice",     type: "function", stateMutability: "view",       inputs: [],                                                                                         outputs: [{ type: "uint256" }] },
  // write
  { name: "addLiquidity",    type: "function", stateMutability: "nonpayable", inputs: [{ name: "amtA", type: "uint256" }, { name: "amtB", type: "uint256" }, { name: "minLP", type: "uint256" }],                                          outputs: [{ type: "uint256" }] },
  { name: "removeLiquidity", type: "function", stateMutability: "nonpayable", inputs: [{ name: "lpAmount", type: "uint256" }, { name: "minA", type: "uint256" }, { name: "minB", type: "uint256" }],                                      outputs: [{ type: "uint256" }, { type: "uint256" }] },
  { name: "swapExactIn",     type: "function", stateMutability: "nonpayable", inputs: [{ name: "tokenIn", type: "address" }, { name: "amtIn", type: "uint256" }, { name: "minOut", type: "uint256" }],                                    outputs: [{ type: "uint256" }] },
  // approve passthrough (LP token is ERC-20)
  { name: "approve",         type: "function", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],              outputs: [{ type: "bool" }] },
] as const;

// ─── KaiAMM ──────────────────────────────────────────────────────────────────
export const AMM_ABI = [
  { name: "getPool",       type: "function", stateMutability: "view",       inputs: [{ name: "tokenA", type: "address" }, { name: "tokenB", type: "address" }],                outputs: [{ type: "address" }] },
  { name: "poolCount",     type: "function", stateMutability: "view",       inputs: [],                                                                                         outputs: [{ type: "uint256" }] },
  { name: "allPools",      type: "function", stateMutability: "view",       inputs: [{ name: "index",  type: "uint256" }],                                                      outputs: [{ type: "address" }] },
  { name: "registerPool",  type: "function", stateMutability: "nonpayable", inputs: [{ name: "tokenA", type: "address" }, { name: "tokenB", type: "address" }, { name: "pool", type: "address" }], outputs: [] },
  { name: "addLiquidity",  type: "function", stateMutability: "nonpayable", inputs: [{ name: "tokenA", type: "address" }, { name: "tokenB", type: "address" }, { name: "amtA", type: "uint256" }, { name: "amtB", type: "uint256" }, { name: "minLP", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { name: "removeLiquidity",type:"function", stateMutability: "nonpayable", inputs: [{ name: "tokenA", type: "address" }, { name: "tokenB", type: "address" }, { name: "lpAmount", type: "uint256" }, { name: "minA", type: "uint256" }, { name: "minB", type: "uint256" }], outputs: [{ type: "uint256" }, { type: "uint256" }] },
  { name: "swap",          type: "function", stateMutability: "nonpayable", inputs: [{ name: "tokenIn", type: "address" }, { name: "tokenOut", type: "address" }, { name: "amtIn", type: "uint256" }, { name: "minOut", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { name: "PoolCreated",   type: "event",    inputs: [{ name: "tokenA", type: "address", indexed: true }, { name: "tokenB", type: "address", indexed: true }, { name: "pool", type: "address" }] },
] as const;
