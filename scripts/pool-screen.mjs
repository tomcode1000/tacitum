// Screens every deposit still waiting in the pool through Telegraph sanctions, then approves or rejects.
// Usage: node scripts/pool-screen.mjs
import fs from "node:fs";
import { loadAccount } from "./config.mjs";
import { screenPending } from "../src/screener.js";
import { approvedLeaves } from "../src/pool.js";

const P = JSON.parse(fs.readFileSync("data/pool.json", "utf8"));
const results = await screenPending(loadAccount(), P.pool, P.deployBlock);
console.log(`${results.length} screened; approved set now ${(await approvedLeaves(P.pool, P.deployBlock)).length}`);
fs.writeFileSync(`data/pool-screen-${new Date().toISOString().slice(0, 16).replace(/:/g, "")}.json`, JSON.stringify(results.map(({ commitment, ...r }) => ({ ...r, commitment: commitment.toString() })), null, 2));
