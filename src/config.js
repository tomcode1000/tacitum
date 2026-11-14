// Telegraph testnet (Ethereum Sepolia). Addresses from docs/protocol/addresses-and-params.
// No .env loading here: the library reads only what the caller's process already has.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { sepolia } from "viem/chains";

export const NETWORK = "eip155:11155111";
export const USDC = "0xcc194e1a843B658526D0D5C431f670028582Ae17";
export const DIAMOND = "0x3624EB012B5E998BB57B6bE6C9Cfc9c4bc5eb99b";
export const NODE = process.env.TELEGRAPH_NODE || "https://devnode.telegraphprotocol.com";
export const RPC = process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";

// Where Tacitum keeps state: caches of public records, chosen cover sets, one-time payer keys.
// Shipped data (the filer survey, the shared cover sets) is read from the package as a seed.
export const HOME = path.resolve(process.env.TACITUM_HOME || ".tacitum");
export const KEYS = path.resolve(process.env.TACITUM_KEYS || path.join(HOME, "keys"));
export const SHIPPED = fileURLToPath(new URL("../data/", import.meta.url));

export const usdcAbi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function mint(address to, uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

// Telegraph escrow (docs/using/escrow-inference): deposit once, then pay per call with a signed message.
export const escrowAbi = parseAbi([
  "function depositUSDC(uint256 amount)",
  "function depositUSDCFor(address beneficiary, uint256 amount)",
  "function effectiveBalance(address) view returns (uint256)",
]);

export const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC, { timeout: 30_000, retryCount: 6, retryDelay: 2_000 }) });

export function walletClient(account) {
  return createWalletClient({ account, chain: sepolia, transport: http(RPC, { timeout: 30_000, retryCount: 6, retryDelay: 2_000 }) });
}
