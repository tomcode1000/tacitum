import "dotenv/config";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

// Telegraph testnet (Ethereum Sepolia). Addresses from docs/protocol/addresses-and-params.
export const NETWORK = "eip155:11155111";
export const USDC = "0xcc194e1a843B658526D0D5C431f670028582Ae17";
export const DIAMOND = "0x3624EB012B5E998BB57B6bE6C9Cfc9c4bc5eb99b";
export const NODE = process.env.TELEGRAPH_NODE || "https://devnode.telegraphprotocol.com";
export const RPC = process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";

export const usdcAbi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function mint(address to, uint256 amount)",
]);

export const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC) });

export function loadAccount() {
  const key = process.env.PRIVATE_KEY;
  if (!key) throw new Error("PRIVATE_KEY missing. Run `npm run wallet` first.");
  return privateKeyToAccount(key);
}

export function walletClient(account) {
  return createWalletClient({ account, chain: sepolia, transport: http(RPC) });
}
