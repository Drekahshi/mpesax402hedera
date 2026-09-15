async function testPolicy() {
  console.log('Sending test policy execution to /api/policies/execute...');
  const res = await fetch('http://localhost:3000/api/policies/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      policyId: 'pol_cfa_conservation_01',
      action: 'CREATE_POLICY',
      parameters: { rule: 'conserve_tree_canopy', threshold: 0.85 },
    }),
  });
  const data = await res.json();
  console.log('Policy Response Status:', res.status);
  console.log('Policy Response Data:', JSON.stringify(data, null, 2));
}

testPolicy().catch(console.error);
