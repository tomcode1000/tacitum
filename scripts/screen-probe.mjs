// One screening call against a given sanctions miner, printing the raw answer. Usage:
//   node scripts/screen-probe.mjs [minerId] [address]
import { loadAccount } from "./config.mjs";
import { createClient } from "../src/telegraph.js";
import { SCREEN } from "../src/screener.js";

const miner = Number(process.argv[2] || SCREEN.miner);
const who = process.argv[3] || "0xCa25c626198bfE92158444aE46d4A30766f56550";
const client = createClient(loadAccount());
try {
  const res = await client.askMiner(miner, SCREEN.intent, { name: who });
  console.log(JSON.stringify(res.data || res, null, 2).slice(0, 1500));
} catch (e) {
  console.log("error:", (e.shortMessage || e.message).slice(0, 600));
}
