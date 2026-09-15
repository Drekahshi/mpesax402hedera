async function testDeposit() {
  console.log('Sending test deposit to /api/hedera/securities/deposit...');
  const res = await fetch('http://localhost:3000/api/hedera/securities/deposit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      productId: 'trust',
      tokenSymbol: 'NVR',
      amount: 1,
      recipientAccount: '0.0.5883612',
    }),
  });
  const data = await res.json();
  console.log('Deposit Response Status:', res.status);
  console.log('Deposit Response Data:', JSON.stringify(data, null, 2));
}

testDeposit().catch(console.error);
