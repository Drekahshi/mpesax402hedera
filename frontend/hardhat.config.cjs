const path = require('path');
const dotenv = require('dotenv');
require('@nomicfoundation/hardhat-ethers');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

function normalizePrivateKey(value) {
  if (!value) return undefined;
  const trimmed = value.trim().replace(/^["']|["']$/g, '');
  const hex = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('PRIVATE_KEY must be a 32-byte hexadecimal private key.');
  }
  return `0x${hex}`;
}

const privateKey = normalizePrivateKey(
  process.env.PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY,
);

module.exports = {
  solidity: '0.8.20',
  networks: {
    hardhat: {},
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || 'https://rpc.sepolia.org',
      chainId: 11155111,
      accounts: privateKey ? [privateKey] : [],
    },
  },
};
