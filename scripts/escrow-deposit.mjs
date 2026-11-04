// Usage: node scripts/escrow-deposit.mjs 3   (deposits 3 test USDC into the payer's Telegraph escrow)
import { formatUnits, parseUnits } from "viem";
import { USDC, DIAMOND, usdcAbi, escrowAbi, publicClient, loadAccount, walletClient } from "./config.mjs";

const amount = parseUnits(process.argv[2] || "3", 6);
const account = loadAccount();
const wallet = walletClient(account);

const approve = await wallet.writeContract({ address: USDC, abi: usdcAbi, functionName: "approve", args: [DIAMOND, amount] });
await publicClient.waitForTransactionReceipt({ hash: approve });
const deposit = await wallet.writeContract({ address: DIAMOND, abi: escrowAbi, functionName: "depositUSDC", args: [amount] });
const { blockNumber } = await publicClient.waitForTransactionReceipt({ hash: deposit });

const balance = await publicClient.readContract({ address: DIAMOND, abi: escrowAbi, functionName: "effectiveBalance", args: [account.address], blockNumber });
console.log(`deposited ${formatUnits(amount, 6)} USDC (tx ${deposit}); escrow balance ${formatUnits(balance, 6)}`);
