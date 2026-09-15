import 'dotenv/config';
import { executeContractProductDeposit } from '../../frontend/src/lib/productVaultClient';

async function main() {
  console.log('Testing live on-chain product vault deposit call on Hedera Testnet...');
  const res = await executeContractProductDeposit({
    productId: 'trust',
    tokenSymbol: 'NVR',
    amount: 10,
  });
  console.log('Success:', res);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
