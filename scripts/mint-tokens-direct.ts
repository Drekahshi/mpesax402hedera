import { createPublicClient, createWalletClient, http, parseUnits, formatUnits, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const TOKENS: Record<string, Address> = {
  NVR:    '0x6489Ea8302b00A8eEd4D82a78A5f9e71Fe2DaC62',
  yBOB:   '0xE4f6A3506616f7c8e445B20a5D93521bFeE97979',
  YTOKEN: '0xF550ACf387011BC0172F2a14656AcE65846b7fBC',
  YGOLD:  '0xEbA875e6cb6d19d8d31b3D29a2b2cE7457D5808A',
  GAMI:   '0x199fC58F7Ce929f1dBDA89b9EB2391582a321e7d',
  CENTS:  '0x1bd79052747A236Aca137380394da27771e95eeA',
};

const TOKEN_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs:  [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'mint',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs:  [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'grantRole',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs:  [{ name: 'role', type: 'bytes32' }, { name: 'account', type: 'address' }],
    outputs: [],
  },
  {
    name: 'hasRole',
    type: 'function',
    stateMutability: 'view',
    inputs:  [{ name: 'role', type: 'bytes32' }, { name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

const MINTER_ROLE = '0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6' as const;

async function main() {
  let pk = (process.env.PRIVATE_KEY || '').trim().replace(/^["']|["']$/g, '');
  if (pk && !pk.startsWith('0x')) pk = '0x' + pk;
  if (!pk || pk.length !== 66) {
    throw new Error('PRIVATE_KEY not set or invalid in .env');
  }

  const targetRecipient = (process.argv[2] || process.env.WALLET_ADDRESS || '0xB13727161583e38185530755a1A96D00fcCae870') as Address;
  const account = privateKeyToAccount(pk as `0x${string}`);

  // List of reliable public Sepolia RPC endpoints
  const rpcEndpoints = [
    'https://ethereum-sepolia-rpc.publicnode.com',
    'https://1rpc.io/sepolia',
    'https://sepolia.drpc.org',
    'https://rpc2.sepolia.org',
  ];

  let publicClient: any;
  let walletClient: any;
  let connectedRpc = '';

  for (const url of rpcEndpoints) {
    try {
      const testClient = createPublicClient({
        chain: sepolia,
        transport: http(url),
      });
      await testClient.getBlockNumber();
      connectedRpc = url;
      publicClient = testClient;
      walletClient = createWalletClient({
        account,
        chain: sepolia,
        transport: http(url),
      });
      break;
    } catch {
      // try next
    }
  }

  if (!publicClient) {
    throw new Error('Could not connect to any Sepolia RPC endpoint');
  }

  console.log('====================================================');
  console.log('  KAI Token Mint Script (Viem)');
  console.log('====================================================');
  console.log(`  Deployer  : ${account.address}`);
  console.log(`  Recipient : ${targetRecipient}`);
  console.log(`  RPC       : ${connectedRpc}`);
  console.log('====================================================\n');

  const ethBalance = await publicClient.getBalance({ address: account.address });
  console.log(`Deployer ETH Balance: ${formatUnits(ethBalance, 18)} ETH`);

  for (const [symbol, address] of Object.entries(TOKENS)) {
    console.log(`\n--- ${symbol} (${address}) ---`);
    const balanceBefore = await publicClient.readContract({
      address,
      abi: TOKEN_ABI,
      functionName: 'balanceOf',
      args: [targetRecipient],
    });
    console.log(`   Recipient balance before: ${formatUnits(balanceBefore, 18)} ${symbol}`);

    // Check deployer minter role
    const hasRole = await publicClient.readContract({
      address,
      abi: TOKEN_ABI,
      functionName: 'hasRole',
      args: [MINTER_ROLE, account.address],
    });

    if (!hasRole) {
      console.log(`   Granting MINTER_ROLE to deployer...`);
      const grantTx = await walletClient.writeContract({
        address,
        abi: TOKEN_ABI,
        functionName: 'grantRole',
        args: [MINTER_ROLE, account.address],
      });
      await publicClient.waitForTransactionReceipt({ hash: grantTx });
      console.log(`   ✓ MINTER_ROLE granted: ${grantTx}`);
    }

    // Mint 5,000 tokens to recipient
    const mintAmount = parseUnits('5000', 18);
    console.log(`   Minting 5,000 ${symbol} to ${targetRecipient}...`);
    try {
      const mintTx = await walletClient.writeContract({
        address,
        abi: TOKEN_ABI,
        functionName: 'mint',
        args: [targetRecipient, mintAmount],
      });
      console.log(`   Waiting for tx receipt ${mintTx}...`);
      await publicClient.waitForTransactionReceipt({ hash: mintTx });
      console.log(`   ✓ Minted successfully! Tx: ${mintTx}`);
    } catch (e: any) {
      console.error(`   ❌ Failed to mint ${symbol}:`, e?.message ?? e);
    }

    const balanceAfter = await publicClient.readContract({
      address,
      abi: TOKEN_ABI,
      functionName: 'balanceOf',
      args: [targetRecipient],
    });
    console.log(`   Recipient balance after: ${formatUnits(balanceAfter, 18)} ${symbol}`);
  }

  console.log('\n====================================================');
  console.log('  Minting Complete!');
  console.log('====================================================\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
