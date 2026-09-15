import 'dotenv/config';
import { privateKeyToAccount } from 'viem/accounts';
import { Client, AccountId, PrivateKey, TransferTransaction, Hbar } from '@hashgraph/sdk';

async function checkAndFund() {
  let pk = (process.env.PRIVATE_KEY || '').trim().replace(/^["']|["']$/g, '');
  if (!pk.startsWith('0x')) pk = '0x' + pk;
  const acc = privateKeyToAccount(pk as `0x${string}`);
  console.log('Deployer EVM address:', acc.address);

  const opId = process.env.HEDERA_OPERATOR_ID!;
  const opKey = process.env.HEDERA_OPERATOR_KEY!;

  const client = Client.forTestnet();
  client.setOperator(AccountId.fromString(opId), PrivateKey.fromString(opKey));

  console.log('Funding deployer EVM address with 20 HBAR for gas on Hedera Testnet JSON-RPC relay...');
  try {
    const tx = await new TransferTransaction()
      .addHbarTransfer(AccountId.fromString(opId), new Hbar(-20))
      .addHbarTransfer(acc.address, new Hbar(20))
      .setMaxTransactionFee(new Hbar(2))
      .execute(client);
    const receipt = await tx.getReceipt(client);
    console.log('Funded successfully! Status:', receipt.status.toString());
  } catch (e: any) {
    console.warn('Funding notice:', e?.message || e);
  }

  client.close();
}

checkAndFund();
