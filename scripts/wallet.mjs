// Creates a testnet-only payer key in .env if there is none, prints balances,
// and mints 10 test USDC when the wallet has Sepolia ETH for gas but no USDC.
import fs from "node:fs";
import { formatEther, formatUnits, parseUnits } from "viem";
import { generatePrivateKey } from "viem/accounts";

if (!fs.existsSync(".env")) fs.copyFileSync(".env.example", ".env");
let env = fs.readFileSync(".env", "utf8");
if (!/^PRIVATE_KEY=0x[0-9a-fA-F]{64}/m.test(env)) {
  env = env.replace(/^PRIVATE_KEY=.*$/m, `PRIVATE_KEY=${generatePrivateKey()}`);
  fs.writeFileSync(".env", env);
  console.log("Created a new testnet payer key in .env (never commit it).");
}

const { usdcAbi, publicClient, loadAccount, usdcToken } = await import("./config.mjs");
const USDC = await usdcToken();
const account = loadAccount();

const eth = await publicClient.getBalance({ address: account.address });
let usdc = await publicClient.readContract({ address: USDC, abi: usdcAbi, functionName: "balanceOf", args: [account.address] });
console.log(`payer   ${account.address}`);
console.log(`ETH     ${formatEther(eth)}`);
console.log(`USDC    ${formatUnits(usdc, 6)}`);

// The Diamond's token: the test USDC can be minted by anyone (mint(to, amount)); Circle USDC comes from faucet.circle.com.
if (usdc < parseUnits("0.1", 6)) {
  console.log(`\nTop up ${USDC} for ${account.address}: mint(address,uint256) on the test token, or faucet.circle.com for Circle USDC.`);
  if (eth === 0n) console.log("It also needs a little Sepolia ETH for gas (~0.01) from any Sepolia faucet.");
}
