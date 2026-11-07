// Filer survey. The filings answer is public, and a famous target with SEC filings stands out
// among decoys with none. So, once and ahead of time, ask the filings miner about the whole
// pool of well-known names plus the desk's watchlist, in random order, from a separate survey
// wallet. Decoys are then picked to match the target's filer status. The survey says nothing
// about which name will later be a target: every target is one of ~120 names asked together.
//   node scripts/survey-filings.mjs      paid, resumable: writes data/filers.json
import "dotenv/config";
import fs from "node:fs";
import { formatUnits, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { USDC, DIAMOND, usdcAbi, escrowAbi, publicClient, walletClient } from "./config.mjs";
import { createClient } from "../src/telegraph.js";
import { listedSample, styleLike, fameHits } from "../src/decoys.js";
import { CHECKS } from "../src/assess.js";

const OUT = "data/filers.json";
const MIN_LEVEL = 0.8; // famous targets sit at 1.2 and above; leave room below
const WATCHLIST = ["Barclays PLC", "Vodafone Group PLC", "Tesco PLC", "Rolls-Royce Holdings PLC", "HSBC Holdings PLC", "Unilever PLC", "AstraZeneca PLC", "Lloyds Banking Group PLC"];

if (!process.env.SURVEY_KEY) throw new Error("SURVEY_KEY missing in .env");
const account = privateKeyToAccount(process.env.SURVEY_KEY);
const wallet = walletClient(account);

// Fund the survey wallet's escrow from its own minted test USDC: no transfer from the payer.
const escrow = await publicClient.readContract({ address: DIAMOND, abi: escrowAbi, functionName: "effectiveBalance", args: [account.address] });
if (escrow < parseUnits("2", 6)) {
  const amount = parseUnits("5", 6);
  const mint = await wallet.writeContract({ address: USDC, abi: usdcAbi, functionName: "mint", args: [account.address, amount] });
  await publicClient.waitForTransactionReceipt({ hash: mint });
  const approve = await wallet.writeContract({ address: USDC, abi: usdcAbi, functionName: "approve", args: [DIAMOND, amount] });
  await publicClient.waitForTransactionReceipt({ hash: approve });
  const deposit = await wallet.writeContract({ address: DIAMOND, abi: escrowAbi, functionName: "depositUSDC", args: [amount] });
  await publicClient.waitForTransactionReceipt({ hash: deposit });
  console.log(`survey wallet ${account.address}: deposited ${formatUnits(amount, 6)} USDC`);
}

const pool = [];
for (const name of new Set((await listedSample("GB")).map((n) => styleLike("Foo PLC", n))))
  if (Math.log10(1 + (await fameHits(name))) >= MIN_LEVEL) pool.push(name);
const names = [...new Set([...pool, ...WATCHLIST])].sort(() => Math.random() - 0.5);

const filers = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const client = createClient(account);
const { intent, miners, params } = CHECKS.filings;
let asked = 0;
for (const name of names) {
  if (name in filers) continue;
  const res = await client.askMiner(miners[0], intent, params({ name }));
  // A non-filer is not "0 filings": the miner fails with entity_not_found (or ambiguous_entity),
  // which is just as public and just as telling, so it counts as 0.
  const notFiler = /\[(entity_not_found|ambiguous_entity)\]/.test(res.data?.error || "");
  const count = res.ok ? Number(res.data?.result?.filing_count ?? NaN) : notFiler ? 0 : NaN;
  if (Number.isNaN(count)) {
    console.log(`no answer  ${name}: ${res.status} ${JSON.stringify(res.data).slice(0, 80)}`);
    continue; // left out, so the next run asks again
  }
  filers[name] = count;
  fs.writeFileSync(OUT, JSON.stringify(filers, null, 2));
  asked++;
  if (count > 0) console.log(`filer      ${name}: ${count}`);
}
const all = Object.values(filers);
console.log(`\nasked ${asked}; surveyed ${all.length}/${names.length}, filers ${all.filter((c) => c > 0).length}`);
