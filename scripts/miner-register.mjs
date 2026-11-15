// Registers the Tacitum adverse-media miner on the Telegraph H2 contract (Sepolia).
// Usage: node scripts/miner-register.mjs [--dry]
// Steps: fetch the hosted YAML and check it matches miner/public/miner.yaml, swap test USDC for
// MACHINA if the bond needs it, approve the bond, simulate registerMiner, then send it.
import fs from "node:fs";
import { createHash } from "node:crypto";
import { parseAbi, parseUnits, formatUnits } from "viem";
import { USDC, DIAMOND, usdcAbi, publicClient, walletClient, loadAccount } from "./config.mjs";

const DRY = process.argv.includes("--dry");
const YAML_URL = "https://tacitum-adverse.vercel.app/miner.yaml";
const MACHINA = "0xd68305cA83C7AF42A4F720144E7416fB53F8AaF4";
const ROUTER = "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E"; // Uniswap SwapRouter02 (Sepolia)
const INTENTS = ["NEWS_SEARCH_GENERAL"];
const MIN_PRICE = 10000n; // $0.01

const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)", "function approve(address,uint256) returns (bool)", "function allowance(address,address) view returns (uint256)"]);
const routerAbi = parseAbi(["function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256)"]);
const registryAbi = parseAbi([
  "function registerMiner(string yamlUrl, bytes32 yamlHash, address feeAddress, uint256 minPriceUsdc, string[] supportedIntents) returns (uint256)",
  "event MinerRegistered(uint256 indexed registrationId, address indexed miner, string yamlUrl)",
]);

const account = loadAccount();
const w = walletClient(account);
const wait = async (hash) => {
  const r = await publicClient.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`reverted: ${hash}`);
  return r;
};

// 1. The hosted YAML must be byte-identical to the repo copy (the hash is what goes on chain).
const local = fs.readFileSync("miner/public/miner.yaml");
const hosted = Buffer.from(await (await fetch(YAML_URL)).arrayBuffer());
if (!hosted.equals(local)) throw new Error("hosted YAML differs from miner/public/miner.yaml: deploy first");
const yamlHash = `0x${createHash("sha256").update(local).digest("hex")}`;
console.log(`yaml ${YAML_URL} sha256 ${yamlHash}`);

// 2. Bond: about $1 of MACHINA for one intent. Swap 2 test USDC if we hold under 1.5 MACHINA.
const bal = () => publicClient.readContract({ address: MACHINA, abi: erc20, functionName: "balanceOf", args: [account.address] });
if ((await bal()) < parseUnits("1.5", 18) && !DRY) {
  const amountIn = parseUnits("2", 6);
  if ((await publicClient.readContract({ address: USDC, abi: usdcAbi, functionName: "allowance", args: [account.address, ROUTER] })) < amountIn) {
    await wait(await w.writeContract({ address: USDC, abi: usdcAbi, functionName: "approve", args: [ROUTER, amountIn] }));
  }
  const swap = await w.writeContract({ address: ROUTER, abi: routerAbi, functionName: "exactInputSingle", args: [{ tokenIn: USDC, tokenOut: MACHINA, fee: 3000, recipient: account.address, amountIn, amountOutMinimum: 0n, sqrtPriceLimitX96: 0n }] });
  await wait(swap);
  console.log(`swapped 2 USDC for MACHINA, tx ${swap}`);
}
console.log(`MACHINA balance ${formatUnits(await bal(), 18)}`);
if ((await publicClient.readContract({ address: MACHINA, abi: erc20, functionName: "allowance", args: [account.address, DIAMOND] })) < parseUnits("2", 18) && !DRY) {
  await wait(await w.writeContract({ address: MACHINA, abi: erc20, functionName: "approve", args: [DIAMOND, parseUnits("3", 18)] }));
}

// 3. Simulate, then send.
const args = [YAML_URL, yamlHash, account.address, MIN_PRICE, INTENTS];
const sim = await publicClient.simulateContract({ account, address: DIAMOND, abi: registryAbi, functionName: "registerMiner", args });
console.log(`simulation ok: registrationId would be ${sim.result}`);
if (DRY) process.exit(0);
const tx = await w.writeContract(sim.request);
const r = await wait(tx);
console.log(`registered: registrationId ${sim.result}, tx ${tx}, block ${r.blockNumber}`);
fs.writeFileSync("data/miner.json", JSON.stringify({ registrationId: Number(sim.result), slug: "tacitum-adverse-media", id: 7314402, yamlUrl: YAML_URL, yamlHash, intents: INTENTS, minPriceUsdc: Number(MIN_PRICE), tx, registeredAt: new Date().toISOString() }, null, 2));
