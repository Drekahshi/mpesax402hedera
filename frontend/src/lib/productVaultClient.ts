/**
 * frontend/src/lib/productVaultClient.ts
 *
 * Interacts with the KaiProductVault EVM smart contract on Hedera Testnet.
 * Executes on-chain product deposits, withdrawals, and ecosystem actions,
 * forwarding a small HBAR protocol fee (0.001 HBAR) to the treasury account.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  defineChain,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import deployedAddresses from './deployedAddresses.json';

export const hederaTestnetChain = defineChain({
  id: 296,
  name: 'Hedera Testnet',
  nativeCurrency: { name: 'HBAR', symbol: 'HBAR', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.HEDERA_RPC_URL || 'https://testnet.hashio.io/api'] },
  },
  blockExplorers: {
    default: { name: 'HashScan', url: 'https://hashscan.io/testnet' },
  },
});

export const KAI_PRODUCT_VAULT_ADDRESS =
  ((deployedAddresses as any)?.productVault as Address) ||
  '0x718ca1bac5dc627925f7fcda9df26ebe4869d02b';

export const KAI_PRODUCT_VAULT_ABI = [
  {
    type: 'function',
    name: 'deposit',
    inputs: [
      { name: 'productId', type: 'string' },
      { name: 'tokenSymbol', type: 'string' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'withdraw',
    inputs: [
      { name: 'productId', type: 'string' },
      { name: 'tokenSymbol', type: 'string' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'executeEcosystemAction',
    inputs: [
      { name: 'actionType', type: 'string' },
      { name: 'details', type: 'string' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'getProductBalance',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'productId', type: 'string' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'treasury',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'fee',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

function getClients() {
  let pk = (process.env.PRIVATE_KEY || '').trim().replace(/^["']|["']$/g, '');
  if (!pk.startsWith('0x')) pk = '0x' + pk;
  if (pk.length !== 66) throw new Error('Invalid PRIVATE_KEY in server environment');

  const account = privateKeyToAccount(pk as `0x${string}`);
  const rpcUrl = process.env.HEDERA_RPC_URL || 'https://testnet.hashio.io/api';

  const publicClient = createPublicClient({
    chain: hederaTestnetChain,
    transport: http(rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain: hederaTestnetChain,
    transport: http(rpcUrl),
  });

  return { publicClient, walletClient, account };
}

/**
 * Executes a real EVM product deposit on Hedera Testnet, sending a 0.001 HBAR fee to treasury.
 */
export async function executeContractProductDeposit({
  productId,
  tokenSymbol,
  amount,
}: {
  productId: string;
  tokenSymbol: string;
  amount: number;
}) {
  const { publicClient, walletClient, account } = getClients();
  const feeValue = parseEther('0.001'); // 0.001 HBAR protocol fee to treasury
  const rawAmount = BigInt(Math.floor(amount));

  const txHash = await walletClient.writeContract({
    address: KAI_PRODUCT_VAULT_ADDRESS,
    abi: KAI_PRODUCT_VAULT_ABI,
    functionName: 'deposit',
    args: [productId, tokenSymbol, rawAmount],
    value: feeValue,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  return {
    success: receipt.status === 'success',
    txHash,
    explorerUrl: `https://hashscan.io/testnet/transaction/${txHash}`,
    contractAddress: KAI_PRODUCT_VAULT_ADDRESS,
    feePaid: '0.001 HBAR',
    caller: account.address,
  };
}

/**
 * Executes a real EVM product withdrawal on Hedera Testnet, sending a 0.001 HBAR fee to treasury.
 */
export async function executeContractProductWithdraw({
  productId,
  tokenSymbol,
  amount,
}: {
  productId: string;
  tokenSymbol: string;
  amount: number;
}) {
  const { publicClient, walletClient, account } = getClients();
  const feeValue = parseEther('0.001');
  const rawAmount = BigInt(Math.floor(amount));

  const txHash = await walletClient.writeContract({
    address: KAI_PRODUCT_VAULT_ADDRESS,
    abi: KAI_PRODUCT_VAULT_ABI,
    functionName: 'withdraw',
    args: [productId, tokenSymbol, rawAmount],
    value: feeValue,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  return {
    success: receipt.status === 'success',
    txHash,
    explorerUrl: `https://hashscan.io/testnet/transaction/${txHash}`,
    contractAddress: KAI_PRODUCT_VAULT_ADDRESS,
    feePaid: '0.001 HBAR',
    caller: account.address,
  };
}

/**
 * Executes an arbitrary ecosystem action on the smart contract with low HBAR fee to treasury.
 */
export async function executeContractEcosystemAction({
  actionType,
  details,
  amount,
}: {
  actionType: string;
  details: string;
  amount: number;
}) {
  const { publicClient, walletClient, account } = getClients();
  const feeValue = parseEther('0.001');
  const rawAmount = BigInt(Math.floor(amount));

  const txHash = await walletClient.writeContract({
    address: KAI_PRODUCT_VAULT_ADDRESS,
    abi: KAI_PRODUCT_VAULT_ABI,
    functionName: 'executeEcosystemAction',
    args: [actionType, details, rawAmount],
    value: feeValue,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  return {
    success: receipt.status === 'success',
    txHash,
    explorerUrl: `https://hashscan.io/testnet/transaction/${txHash}`,
    contractAddress: KAI_PRODUCT_VAULT_ADDRESS,
    feePaid: '0.001 HBAR',
    caller: account.address,
  };
}

export const KAI_PRODUCT_MARKET_ADDRESS =
  ((deployedAddresses as any)?.productMarket as Address) ||
  '0x11a6beeaa77173f2fbf715bec73b3c223ac2cf14';

export const KAI_PRODUCT_MARKET_ABI = [
  {
    type: 'function',
    name: 'buyProduct',
    inputs: [
      { name: 'productId', type: 'string' },
      { name: 'tokenSymbol', type: 'string' },
      { name: 'quantity', type: 'uint256' },
      { name: 'totalPrice', type: 'uint256' },
    ],
    outputs: [{ name: 'orderId', type: 'bytes32' }],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'products',
    inputs: [{ name: '', type: 'string' }],
    outputs: [
      { name: 'id', type: 'string' },
      { name: 'name', type: 'string' },
      { name: 'tokenSymbol', type: 'string' },
      { name: 'price', type: 'uint256' },
      { name: 'seller', type: 'address' },
      { name: 'active', type: 'bool' },
      { name: 'totalSold', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalProductVolume',
    inputs: [{ name: '', type: 'string' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalPurchasesCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

/**
 * Executes a real on-chain product purchase on Hedera EVM via KaiProductMarket contract.
 * Automatically transfers 0.001 HBAR protocol fee directly to treasury.
 */
export async function executeContractBuyProduct({
  productId,
  tokenSymbol,
  quantity,
  totalPrice,
}: {
  productId: string;
  tokenSymbol: string;
  quantity: number;
  totalPrice?: number;
}) {
  const { publicClient, walletClient, account } = getClients();
  const feeValue = parseEther('0.001'); // 0.001 HBAR = 100,000 tinybars on Hedera EVM
  const rawQty = BigInt(Math.max(1, Math.floor(quantity)));
  const rawPrice = BigInt(Math.floor(totalPrice ?? quantity * 10));

  const txHash = await walletClient.writeContract({
    address: KAI_PRODUCT_MARKET_ADDRESS,
    abi: KAI_PRODUCT_MARKET_ABI,
    functionName: 'buyProduct',
    args: [productId, tokenSymbol, rawQty, rawPrice],
    value: feeValue,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  return {
    success: receipt.status === 'success',
    txHash,
    explorerUrl: `https://hashscan.io/testnet/transaction/${txHash}`,
    contractAddress: KAI_PRODUCT_MARKET_ADDRESS,
    feePaid: '0.001 HBAR',
    buyer: account.address,
  };
}

