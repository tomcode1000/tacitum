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

const { USDC, usdcAbi, publicClient, loadAccount, walletClient } = await import("./config.mjs");
const account = loadAccount();

const eth = await publicClient.getBalance({ address: account.address });
let usdc = await publicClient.readContract({ address: USDC, abi: usdcAbi, functionName: "balanceOf", args: [account.address] });
console.log(`payer   ${account.address}`);
console.log(`ETH     ${formatEther(eth)}`);
console.log(`USDC    ${formatUnits(usdc, 6)}`);

if (usdc < parseUnits("0.1", 6)) {
  if (eth === 0n) {
    console.log("\nNeeds a little Sepolia ETH to mint test USDC. Send ~0.01 to the payer address, then rerun.");
  } else {
    const hash = await walletClient(account).writeContract({ address: USDC, abi: usdcAbi, functionName: "mint", args: [account.address, parseUnits("10", 6)] });
    await publicClient.waitForTransactionReceipt({ hash });
    usdc = await publicClient.readContract({ address: USDC, abi: usdcAbi, functionName: "balanceOf", args: [account.address] });
    console.log(`minted  10 test USDC (tx ${hash}), balance now ${formatUnits(usdc, 6)}`);
  }
}
