import "dotenv/config";
import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { defineConfig } from "hardhat/config";

// Normalise a raw hex private key → 0x-prefixed 32-byte hex string.
function parsePrivateKey(raw: string | undefined): `0x${string}` | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim().replace(/^["']|["']$/g, "");
  const hex = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return undefined;
  return `0x${hex}`;
}

const privateKey = parsePrivateKey(
  process.env.PRIVATE_KEY ?? process.env.DEPLOYER_PRIVATE_KEY ?? process.env.SEPOLIA_PRIVATE_KEY,
);

const sepoliaRpc =
  process.env.SEPOLIA_RPC_URL ??
  process.env.RPC_URL ??
  "https://rpc.sepolia.org";

const hederaTestnetRpc =
  process.env.HEDERA_RPC_URL ??
  "https://testnet.hashio.io/api";

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
        settings: {
          viaIR: true,
          optimizer: { enabled: true, runs: 200 },
        },
      },
      production: {
        version: "0.8.28",
        settings: {
          viaIR: true,
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    localhost: {
      type: "http",
      chainType: "l1",
      url: "http://127.0.0.1:8545",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: sepoliaRpc,
      chainId: 11155111,
      accounts: privateKey ? [privateKey] : [],
    },
    hederaTestnet: {
      type: "http",
      chainType: "l1",
      url: hederaTestnetRpc,
      chainId: 296,
      accounts: privateKey ? [privateKey] : [],
    },
  },
});
