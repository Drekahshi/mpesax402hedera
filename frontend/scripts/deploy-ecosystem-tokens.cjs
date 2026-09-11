const fs = require('fs');
const path = require('path');
const { ethers, network } = require('hardhat');

const TOKENS = [
  { symbol: 'NVR', name: 'NVR Governance Token', envKey: 'NEXT_PUBLIC_NVR_ADDRESS' },
  { symbol: 'yBOB', name: 'yBOB Stable Token', envKey: 'NEXT_PUBLIC_YBOB_ADDRESS' },
  { symbol: 'YTOKEN', name: 'Y Token ETF', envKey: 'NEXT_PUBLIC_YTOKEN_ADDRESS' },
  { symbol: 'YGOLD', name: 'YGold ETF', envKey: 'NEXT_PUBLIC_YGOLD_ADDRESS' },
  { symbol: 'GAMI', name: 'GAMI Rewards Token', envKey: 'NEXT_PUBLIC_GAMI_ADDRESS' },
  { symbol: 'CENTS', name: 'Nuvari Cents Token', envKey: 'NEXT_PUBLIC_CENTS_ADDRESS' },
];

const INITIAL_SUPPLY = ethers.parseUnits('100000', 18);

function updateEnvFile(envPath, deployments) {
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  for (const token of deployments) {
    const line = `${token.envKey}=${token.address}`;
    const pattern = new RegExp(`^${token.envKey}=.*$`, 'm');
    content = pattern.test(content) ? content.replace(pattern, line) : `${content.trimEnd()}\n${line}\n`;
  }
  fs.writeFileSync(envPath, content);
}

async function main() {
  if (network.name === 'sepolia' && !process.env.PRIVATE_KEY && !process.env.DEPLOYER_PRIVATE_KEY) {
    throw new Error('Set PRIVATE_KEY or DEPLOYER_PRIVATE_KEY in frontend/.env.local or .env.');
  }

  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Deploying from ${deployer.address} on ${network.name}`);
  console.log(`Deployer balance: ${ethers.formatEther(balance)} ETH`);

  if (network.name === 'sepolia' && balance === 0n) {
    throw new Error('Deployer wallet has no Sepolia ETH for gas.');
  }

  const factory = await ethers.getContractFactory('EcosystemToken');
  const deployments = [];
  for (const token of TOKENS) {
    console.log(`Deploying ${token.symbol}...`);
    const contract = await factory.deploy(token.name, token.symbol, INITIAL_SUPPLY);
    await contract.waitForDeployment();
    const address = await contract.getAddress();
    console.log(`${token.symbol}: ${address}`);
    deployments.push({ ...token, address });
  }

  const payload = {
    network: network.name,
    chainId: network.config.chainId,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    initialSupply: '100000',
    decimals: 18,
    tokens: Object.fromEntries(deployments.map(token => [token.symbol, token.address])),
    explorerBase: network.name === 'sepolia' ? 'https://sepolia.etherscan.io' : 'https://etherscan.io',
  };

  updateEnvFile(path.join(__dirname, '..', '.env.local'), deployments);
  updateEnvFile(path.join(__dirname, '..', '.env'), deployments);
  fs.writeFileSync(path.join(__dirname, '..', 'token-addresses.json'), JSON.stringify(payload, null, 2) + '\n');
  fs.writeFileSync(path.join(__dirname, '..', 'src', 'lib', 'deployedAddresses.json'), JSON.stringify(payload, null, 2) + '\n');
  console.log('Addresses written to .env.local, token-addresses.json, and src/lib/deployedAddresses.json');
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});
