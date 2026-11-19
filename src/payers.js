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
import path from "node:path";
import { DIAMOND, KEYS, usdcAbi, escrowAbi, publicClient, walletClient, ledger, usdcToken } from "./config.js";

// One-time keys are kept (in TACITUM_KEYS) so the record can be opened for an auditor later.

export async function oneTimePayer(funder, amountUsd, label = "") {
  const amount = parseUnits(String(amountUsd), 6);
  const key = generatePrivateKey();
  const account = privateKeyToAccount(key);

  const wallet = walletClient(funder);
  const USDC = await usdcToken(); // the token the Diamond takes today
  const allowance = await publicClient.readContract({ address: USDC, abi: usdcAbi, functionName: "allowance", args: [funder.address, DIAMOND] });
  if (allowance < amount) {
    // Approve a float once instead of per payer: one fewer transaction from the desk each time.
    const hash = await wallet.writeContract({ address: USDC, abi: usdcAbi, functionName: "approve", args: [DIAMOND, parseUnits("5", 6)] });
    await publicClient.waitForTransactionReceipt({ hash, timeout: 600_000 });
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
  const { blockNumber } = await publicClient.waitForTransactionReceipt({ hash: fundingTx, timeout: 600_000 });
  // On-chain ledger at the funding block (the node's view catches up a little later).
  const [deposited] = await publicClient.readContract({ address: DIAMOND, abi: escrowAbi, functionName: "ledgerAccount", args: [account.address], blockNumber });
  if (deposited < amount) throw new Error(`escrow shows ${formatUnits(deposited, 6)} USDC deposited for ${account.address}, expected ${amountUsd}`);

  fs.mkdirSync(KEYS, { recursive: true });
  const record = { address: account.address, key, funder: funder.address, fundingTx, amountUsd: Number(amountUsd), label, createdAt: new Date().toISOString() };
  fs.writeFileSync(path.join(KEYS, `${account.address}.json`), JSON.stringify(record, null, 2));

  return { account, fundingTx, funder: funder.address, amountUsd: Number(amountUsd), fundedAt: Date.now() };
}

// What the node will let this address spend next (USD).
export async function escrowBalance(address) {
  return Number(formatUnits((await ledger(address)).available, 6));
}

// P4: fund a one-time payer from the screened pool instead of from the desk. The relayer sends
// the withdraw; on chain the payer's escrow deposit comes from the pool contract, and the desk's
// deposit is one of the approved set. Uses (and spends) the oldest unspent desk note.
export async function poolPayer(relayer, poolInfo, label = "", { pick = (notes) => notes } = {}) {
  const pool = await import("./pool.js");
  const notes = pick(pool.loadNotes(poolInfo.pool).filter((n) => n.desk));
  let note;
  for (const n of notes) {
    const used = await publicClient.readContract({ address: poolInfo.pool, abi: pool.poolAbi, functionName: "spent", args: [n.nullifierHash] });
    const ok = await publicClient.readContract({ address: poolInfo.pool, abi: pool.poolAbi, functionName: "approved", args: [n.commitment] });
    if (!used && ok) { note = n; break; }
  }
  if (!note) throw new Error("no approved, unspent desk note in this pool: deposit first");

  const leaves = await pool.approvedLeaves(poolInfo.pool, poolInfo.deployBlock);
  const tree = await pool.Tree.create(leaves.map((l) => l.commitment));
  const leafIndex = leaves.findIndex((l) => l.commitment === note.commitment);
  const key = generatePrivateKey();
  const account = privateKeyToAccount(key);
  const p = await pool.prove(note, tree, leafIndex, { recipient: account.address, relayer: relayer.address, fee: 0n });
  const fundingTx = await pool.withdraw(relayer, poolInfo.pool, p, { nullifierHash: note.nullifierHash, recipient: account.address });
  await pool.shutdown();

  const amountUsd = poolInfo.denominationUsd;
  fs.mkdirSync(KEYS, { recursive: true });
  fs.writeFileSync(path.join(KEYS, `${account.address}.json`), JSON.stringify({ address: account.address, key, funder: poolInfo.pool, fundingTx, amountUsd, label, note: note.file, createdAt: new Date().toISOString() }, null, 2));
  return { account, fundingTx, funder: poolInfo.pool, amountUsd, fundedAt: Date.now(), anonymitySet: leaves.length, viaPool: true };
}

// Reuse a one-time payer already funded (its key is in TACITUM_KEYS).
export function savedPayer(address) {
  const rec = JSON.parse(fs.readFileSync(path.join(KEYS, `${address}.json`), "utf8"));
  return { account: privateKeyToAccount(rec.key), fundingTx: rec.fundingTx, funder: rec.funder, amountUsd: rec.amountUsd, fundedAt: Date.parse(rec.createdAt), viaPool: !/^0xdbEE/i.test(rec.funder) && rec.label?.includes("pool") };
}
