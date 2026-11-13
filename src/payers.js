// One-time payers (private mode v0). Each private assessment is bought by a wallet that has
// never been seen before, so the feed cannot tie it to the desk's earlier questions.
//
// The funder pays into the new wallet's Telegraph escrow with depositUSDCFor. The new wallet
// then pays per call by signing escrow messages, so it never holds ETH and never sends a
// transaction. What v0 does NOT hide: the deposit itself is on chain, funder -> beneficiary.
// Anyone who looks up who funded the one-time payer finds the desk. The P4 screened pool
// replaces this step.
import fs from "node:fs";
import { formatUnits, parseUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { USDC, DIAMOND, usdcAbi, escrowAbi, publicClient, walletClient } from "../scripts/config.mjs";

const KEYS = "keys"; // gitignored; the keys are kept so the record can be opened for an auditor later

export async function oneTimePayer(funder, amountUsd, label = "") {
  const amount = parseUnits(String(amountUsd), 6);
  const key = generatePrivateKey();
  const account = privateKeyToAccount(key);

  const wallet = walletClient(funder);
  const allowance = await publicClient.readContract({ address: USDC, abi: usdcAbi, functionName: "allowance", args: [funder.address, DIAMOND] });
  if (allowance < amount) {
    // Approve a float once instead of per payer: one fewer transaction from the desk each time.
    const hash = await wallet.writeContract({ address: USDC, abi: usdcAbi, functionName: "approve", args: [DIAMOND, parseUnits("5", 6)] });
    await publicClient.waitForTransactionReceipt({ hash });
  }

  // Load-balanced public RPCs can simulate against a block from before the approval, which
  // reverts with "insufficient allowance". Retry for a few blocks before giving up.
  let fundingTx;
  for (let attempt = 0; !fundingTx; attempt++) {
    try {
      fundingTx = await wallet.writeContract({ address: DIAMOND, abi: escrowAbi, functionName: "depositUSDCFor", args: [account.address, amount] });
    } catch (err) {
      if (attempt >= 5 || !/insufficient allowance/i.test(err.shortMessage || err.message)) throw err;
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
  const { blockNumber } = await publicClient.waitForTransactionReceipt({ hash: fundingTx });
  const balance = await publicClient.readContract({ address: DIAMOND, abi: escrowAbi, functionName: "effectiveBalance", args: [account.address], blockNumber });
  if (balance < amount) throw new Error(`escrow shows ${formatUnits(balance, 6)} USDC for ${account.address}, expected ${amountUsd}`);

  fs.mkdirSync(KEYS, { recursive: true });
  const record = { address: account.address, key, funder: funder.address, fundingTx, amountUsd: Number(amountUsd), label, createdAt: new Date().toISOString() };
  fs.writeFileSync(`${KEYS}/${account.address}.json`, JSON.stringify(record, null, 2));

  return { account, fundingTx, funder: funder.address, amountUsd: Number(amountUsd), fundedAt: Date.now() };
}

export async function escrowBalance(address) {
  const b = await publicClient.readContract({ address: DIAMOND, abi: escrowAbi, functionName: "effectiveBalance", args: [address] });
  return Number(formatUnits(b, 6));
}
