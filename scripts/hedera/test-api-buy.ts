async function testBuy() {
  console.log('Testing live on-chain product purchase on Hedera Testnet...');
  const res = await fetch('http://localhost:3000/api/hedera/products/buy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      productId: 'honey',
      tokenSymbol: 'GAMI',
      quantity: 1,
      totalPrice: 10,
      recipientAccount: '0.0.5883612',
    }),
  });

  const data = await res.json();
  console.log('Buy Response Status:', res.status);
  console.log('Buy Response Data:', JSON.stringify(data, null, 2));
}

testBuy().catch(console.error);
