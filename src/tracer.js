// The tracer: an attacker who sees only public data (chain logs and transactions) and tries to find
// which pool deposit funded a given one-time payer. It never reads notes or keys.
//
// Candidates are the deposits approved before the withdraw. Each heuristic ranks them; the score is
// the probability the heuristic's top pick is the real deposit (1 / ties when it is among the tied
// top, else 0). A private pool keeps every heuristic near chance, 1 / candidates.
import { parseAbiItem, decodeFunctionData } from "viem";
import { publicClient, logsClient } from "./config.js";
import { poolAbi } from "./pool.js";

const DEPOSITED = parseAbiItem("event Deposited(uint256 indexed commitment, address indexed depositor)");
const APPROVED = parseAbiItem("event Approved(uint256 indexed commitment, uint32 leafIndex, bytes32 screeningSignal, uint256 root)");

async function logs(pool, event, fromBlock, toBlock) {
  const out = [];
  for (let from = BigInt(fromBlock); from <= toBlock; from += 9000n) {
    const to = from + 8999n > toBlock ? toBlock : from + 8999n;
    out.push(...(await logsClient.getLogs({ address: pool, event, fromBlock: from, toBlock: to })));
  }
  return out;
}

// Public view of a withdraw: who sent it, which root it proved against, when.
export async function withdrawView(withdrawTx) {
  const tx = await publicClient.getTransaction({ hash: withdrawTx });
  const { args } = decodeFunctionData({ abi: poolAbi, data: tx.input });
  return { block: tx.blockNumber, sender: tx.from.toLowerCase(), root: args[3] };
}

// The scoring rule, pure so it can be tested: candidates [{ commitment, ...features }].
export function scoreHeuristics(candidates, realCommitment, view) {
  const n = candidates.length;
  const top = (key, dir = -1) => {
    const best = candidates.reduce((m, c) => (dir < 0 ? (c[key] > m ? c[key] : m) : (c[key] < m ? c[key] : m)), dir < 0 ? -Infinity : Infinity);
    const tied = candidates.filter((c) => c[key] === best);
    return tied.some((c) => c.commitment === realCommitment) ? 1 / tied.length : 0;
  };
  const sameSender = candidates.filter((c) => c.depositSender === view.sender);
  return {
    candidates: n,
    chance: n ? 1 / n : 0,
    // Most recent deposit before the withdraw: the classic timing attack.
    latestDeposit: top("depositBlock", -1),
    // Smallest gap between approval and withdraw.
    latestApproval: top("approvalBlock", -1),
    // Oldest deposit: a desk that deposited early and waited.
    oldestDeposit: top("depositBlock", 1),
    // Deposit relayed by the same wallet that sent the withdraw.
    sameRelayer: sameSender.some((c) => c.commitment === realCommitment) ? 1 / sameSender.length : 0,
    // Depositor with the fewest transactions (a wallet made just for this).
    freshestDepositor: top("depositorNonce", 1),
  };
}

export async function trace(pool, deployBlock, withdrawTx, realCommitment) {
  const view = await withdrawView(withdrawTx);
  const until = view.block - 1n;
  const deps = new Map((await logs(pool, DEPOSITED, deployBlock, until)).map((l) => [l.args.commitment.toString(), l]));
  const appr = await logs(pool, APPROVED, deployBlock, until);
  const candidates = [];
  for (const a of appr) {
    const d = deps.get(a.args.commitment.toString());
    if (!d) continue;
    const dtx = await publicClient.getTransaction({ hash: d.transactionHash });
    const depositorNonce = await publicClient.getTransactionCount({ address: d.args.depositor, blockNumber: view.block });
    candidates.push({
      commitment: a.args.commitment.toString(),
      depositor: d.args.depositor,
      depositBlock: Number(d.blockNumber),
      approvalBlock: Number(a.blockNumber),
      depositSender: dtx.from.toLowerCase(),
      depositorNonce,
    });
  }
  return { withdrawBlock: Number(view.block), ...scoreHeuristics(candidates, realCommitment.toString(), view) };
}
