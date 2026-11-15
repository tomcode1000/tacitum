// Re-points the registered miner at the current hosted YAML (updateMiner gives a new registrationId).
// Usage: node scripts/miner-update.mjs
import fs from "node:fs";
import { createHash } from "node:crypto";
import { parseAbi } from "viem";
import { DIAMOND, publicClient, walletClient, loadAccount } from "./config.mjs";

const rec = JSON.parse(fs.readFileSync("data/miner.json", "utf8"));
const local = fs.readFileSync("miner/public/miner.yaml");
const hosted = Buffer.from(await (await fetch(rec.yamlUrl)).arrayBuffer());
if (!hosted.equals(local)) throw new Error("hosted YAML differs from miner/public/miner.yaml: deploy first");
const yamlHash = `0x${createHash("sha256").update(local).digest("hex")}`;

const abi = parseAbi(["function updateMiner(uint256 oldRegistrationId, string yamlUrl, bytes32 yamlHash, address feeAddress, uint256 minPriceUsdc, string[] supportedIntents) returns (uint256)"]);
const account = loadAccount();
const args = [BigInt(rec.registrationId), rec.yamlUrl, yamlHash, account.address, BigInt(rec.minPriceUsdc), rec.intents];
const sim = await publicClient.simulateContract({ account, address: DIAMOND, abi, functionName: "updateMiner", args });
const tx = await walletClient(account).writeContract(sim.request);
const r = await publicClient.waitForTransactionReceipt({ hash: tx });
if (r.status !== "success") throw new Error(`updateMiner reverted: ${tx}`);
const history = [...(rec.history || []), { registrationId: rec.registrationId, yamlHash: rec.yamlHash, tx: rec.tx }];
fs.writeFileSync("data/miner.json", JSON.stringify({ ...rec, registrationId: Number(sim.result), yamlHash, tx, updatedAt: new Date().toISOString(), history }, null, 2));
console.log(`updated: registration ${rec.registrationId} -> ${sim.result}, tx ${tx}`);
