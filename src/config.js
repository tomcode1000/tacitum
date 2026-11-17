// Telegraph testnet (Ethereum Sepolia). Addresses from docs/protocol/addresses-and-params.
// No .env loading here: the library reads only what the caller's process already has.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { sepolia } from "viem/chains";

export const NETWORK = "eip155:11155111";
// 17 Nov 2026: Telegraph moved to a new Diamond that uses Circle's Sepolia USDC (faucet.circle.com).
// The old Diamond (0x3624…b99b) and its test USDC (0xcc19…Ae17) are retired; balances did not
// carry over. Both can be overridden for a rollback or another network.
export const DIAMOND = process.env.TELEGRAPH_DIAMOND || "0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b";
export const USDC = process.env.TELEGRAPH_USDC || "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
export const LEGACY = { diamond: "0x3624EB012B5E998BB57B6bE6C9Cfc9c4bc5eb99b", usdc: "0xcc194e1a843B658526D0D5C431f670028582Ae17" };
export const NODE = process.env.TELEGRAPH_NODE || "https://devnode.telegraphprotocol.com";
export const RPC = process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";

// Where Tacitum keeps state: caches of public records, chosen cover sets, one-time payer keys.
// Shipped data (the filer survey, the shared cover sets) is read from the package as a seed.
export const HOME = path.resolve(process.env.TACITUM_HOME || ".tacitum");
export const KEYS = path.resolve(process.env.TACITUM_KEYS || path.join(HOME, "keys"));
export const SHIPPED = fileURLToPath(new URL("../data/", import.meta.url));

export const usdcAbi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function name() view returns (string)",
  "function version() view returns (string)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

// Telegraph escrow (docs/using/escrow-inference): deposit once, then pay per call with a signed message.
export const escrowAbi = parseAbi([
  "function depositUSDC(uint256 amount)",
  "function depositUSDCFor(address beneficiary, uint256 amount)",
  "function ledgerAccount(address) view returns (uint256 deposited, uint256 withdrawn, uint256 requested, uint256 requestedAt)",
]);

// Escrow balance as the node sees it (GET /v1/ledger/account/<address>), in 6-decimal units.
// "available" is what the next paid call can draw on; "deposited" is what reached the Diamond.
export async function ledger(address) {
  const res = await fetch(`${NODE}/v1/ledger/account/${address}`);
  if (!res.ok) throw new Error(`ledger ${res.status}`);
  const j = await res.json();
  return { available: BigInt(j.available || 0), balance: BigInt(j.balance || 0), deposited: BigInt(j.deposited || 0) };
}

export const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC, { timeout: 30_000, retryCount: 6, retryDelay: 2_000 }) });

export function walletClient(account) {
  return createWalletClient({ account, chain: sepolia, transport: http(RPC, { timeout: 30_000, retryCount: 6, retryDelay: 2_000 }) });
}

// Log queries need history the default public node prunes ("pruned history unavailable", 15 Nov),
// so event scans (pool deposits, approvals) use their own RPC.
export const LOGS_RPC = process.env.LOGS_RPC_URL || "https://sepolia.gateway.tenderly.co";
export const logsClient = createPublicClient({ chain: sepolia, transport: http(LOGS_RPC, { timeout: 30_000, retryCount: 6, retryDelay: 2_000 }) });
