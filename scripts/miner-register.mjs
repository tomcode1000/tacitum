// Registers a Tacitum miner (adverse-media or pool-depth) on the Telegraph Diamond (Sepolia).
// Usage: node scripts/miner-register.mjs [--dry] [--miner adverse|depth]   (default adverse)
// Steps: check the hosted YAML matches miner/public/miner.yaml, pay the bond in whatever token the
// Diamond names (USDC since the 17 Nov 2026 Diamond; MACHINA before), simulate, send, and read the
// registration id from the transaction's own logs (a simulated id can be taken by someone else
// before the transaction lands, which happened on 16 Nov).
import fs from "node:fs";
import { createHash } from "node:crypto";
import { parseAbi, formatUnits, zeroAddress } from "viem";
import { USDC, DIAMOND, publicClient, walletClient, loadAccount } from "./config.mjs";

import { MINERS } from "./miners.mjs";
const DRY = process.argv.includes("--dry");
const M = MINERS[process.argv[process.argv.indexOf("--miner") + 1]] ?? MINERS.adverse;
const rec = fs.existsSync(M.record) ? JSON.parse(fs.readFileSync(M.record, "utf8")) : {};
const YAML_URL = rec.yamlUrl || M.yamlUrl;
const INTENTS = M.intents;
const MIN_PRICE = 10000n; // $0.01

const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)", "function approve(address,uint256) returns (bool)", "function allowance(address,address) view returns (uint256)"]);
const diamondAbi = parseAbi([
  "function registerMiner(string yamlUrl, bytes32 yamlHash, address feeAddress, uint256 minPriceUsdc, string[] supportedIntents) returns (uint256)",
  "function machinaToken() view returns (address)",
  "function usdcToken() view returns (address)",
  "function minerBondParams() view returns (uint256 firstIntent, uint256 nextIntents, uint256 beyondNine)",
]);

const account = loadAccount();
const w = walletClient(account);
const wait = async (hash) => {
  const r = await publicClient.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`reverted: ${hash}`);
  return r;
};

// 1. The hosted YAML must be byte-identical to the repo copy (the hash is what goes on chain).
const local = fs.readFileSync(M.yamlFile);
const hosted = Buffer.from(await (await fetch(YAML_URL)).arrayBuffer());
if (!hosted.equals(local)) throw new Error(`hosted YAML at ${YAML_URL} differs from ${M.yamlFile}: deploy first`);
const yamlHash = `0x${createHash("sha256").update(local).digest("hex")}`;
console.log(`yaml ${YAML_URL} sha256 ${yamlHash}`);

// 2. Bond: the Diamond says which token (MACHINA if set, otherwise USDC) and how much.
const machina = await publicClient.readContract({ address: DIAMOND, abi: diamondAbi, functionName: "machinaToken" });
const bondToken = machina === zeroAddress ? await publicClient.readContract({ address: DIAMOND, abi: diamondAbi, functionName: "usdcToken" }).catch(() => USDC) : machina;
const decimals = machina === zeroAddress ? 6 : 18;
const [firstIntent] = await publicClient.readContract({ address: DIAMOND, abi: diamondAbi, functionName: "minerBondParams" });
const need = firstIntent * 2n; // headroom: the bond is priced at registration time
const have = await publicClient.readContract({ address: bondToken, abi: erc20, functionName: "balanceOf", args: [account.address] });
console.log(`bond ${formatUnits(firstIntent, decimals)} in ${machina === zeroAddress ? "USDC" : "MACHINA"} (${bondToken}); wallet holds ${formatUnits(have, decimals)}`);
if (have < firstIntent) throw new Error("not enough of the bond token: top up the wallet first (USDC: faucet.circle.com)");
if (!DRY && (await publicClient.readContract({ address: bondToken, abi: erc20, functionName: "allowance", args: [account.address, DIAMOND] })) < need) {
  await wait(await w.writeContract({ address: bondToken, abi: erc20, functionName: "approve", args: [DIAMOND, need] }));
}

// 3. Simulate, then send; the real id comes from the logs.
const args = [YAML_URL, yamlHash, account.address, MIN_PRICE, INTENTS];
// Load-balanced public RPCs can simulate against a block before the approval landed: retry.
let sim;
for (let i = 0; !sim; i++) {
  try { sim = await publicClient.simulateContract({ account, address: DIAMOND, abi: diamondAbi, functionName: "registerMiner", args }); }
  catch (e) { if (DRY || i >= 6 || !/allowance/i.test(e.shortMessage + e.message)) throw e; await new Promise((r) => setTimeout(r, 5000)); }
}
console.log(`simulation ok (id at simulation time: ${sim.result})`);
if (DRY) process.exit(0);
const tx = await w.writeContract(sim.request);
const r = await wait(tx);
const ours = r.logs.filter((l) => l.address.toLowerCase() === DIAMOND.toLowerCase() && l.topics.length >= 3 && BigInt(l.topics[2]) === BigInt(account.address)).map((l) => BigInt(l.topics[1]));
const registrationId = Number(ours.length ? ours.reduce((a, b) => (b > a ? b : a)) : sim.result);
console.log(`registered: registrationId ${registrationId}, tx ${tx}, block ${r.blockNumber}`);
const history = [...(rec.history || []), ...(rec.registrationId ? [{ registrationId: rec.registrationId, yamlHash: rec.yamlHash, tx: rec.tx, diamond: rec.diamond || "0x3624EB012B5E998BB57B6bE6C9Cfc9c4bc5eb99b" }] : [])];
fs.writeFileSync(M.record, JSON.stringify({ registrationId, slug: M.slug, id: M.id, diamond: DIAMOND, yamlUrl: YAML_URL, yamlHash, intents: INTENTS, minPriceUsdc: Number(MIN_PRICE), tx, registeredAt: new Date().toISOString(), history }, null, 2));
