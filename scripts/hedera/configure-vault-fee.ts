import 'dotenv/config';
import { createPublicClient, createWalletClient, http, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const hederaTestnet = defineChain({
  id: 296,
  name: 'Hedera Testnet',
  nativeCurrency: { name: 'HBAR', symbol: 'HBAR', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet.hashio.io/api'] } },
  blockExplorers: { default: { name: 'HashScan', url: 'https://hashscan.io/testnet' } },
});

async function main() {
  let pk = (process.env.PRIVATE_KEY || '').trim().replace(/^["']|["']$/g, '');
  if (!pk.startsWith('0x')) pk = '0x' + pk;
  const account = privateKeyToAccount(pk as `0x${string}`);

  const publicClient = createPublicClient({ chain: hederaTestnet, transport: http('https://testnet.hashio.io/api') });
  const walletClient = createWalletClient({ account, chain: hederaTestnet, transport: http('https://testnet.hashio.io/api') });

  console.log('Setting fee on KaiProductVault to 100,000 tinybars (0.001 HBAR on Hedera)...');
  const hash = await walletClient.writeContract({
    address: '0x718ca1bac5dc627925f7fcda9df26ebe4869d02b',
    abi: [
      {
        type: 'function',
        name: 'setFee',
        inputs: [{ name: '_newFee', type: 'uint256' }],
        outputs: [],
        stateMutability: 'nonpayable',
      },
    ],
    functionName: 'setFee',
    args: [100000n],
  });

  console.log('Transaction hash:', hash);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log('Receipt status:', receipt.status);
  console.log('HashScan:', `https://hashscan.io/testnet/transaction/${hash}`);
}

main().catch(console.error);
