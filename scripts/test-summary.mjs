// Runs the full test suite and writes docs/assets/test-summary.json, which the README badge reads.
// Usage: node scripts/test-summary.mjs   (exits non-zero if any test fails)
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const r = spawnSync(process.execPath, ["--test", "--test-reporter=tap", "test/**/*.test.mjs", "miner/test/**/*.test.mjs", "depth-miner/test/**/*.test.mjs"], { encoding: "utf8", maxBuffer: 64 << 20 });
const out = r.stdout || "";
const num = (k) => Number((out.match(new RegExp(`^# ${k} (\\d+)`, "m")) || [])[1] || 0);
const files = fs.readdirSync("test").filter((f) => f.endsWith(".test.mjs")).length + fs.readdirSync("miner/test").filter((f) => f.endsWith(".test.mjs")).length + fs.readdirSync("depth-miner/test").filter((f) => f.endsWith(".test.mjs")).length;
const summary = { tests: num("tests"), passed: num("pass"), failed: num("fail"), files, generatedAt: new Date().toISOString(), node: process.version };
summary.label = summary.failed ? `${summary.passed}/${summary.tests} passing` : `${summary.passed} passing`;
summary.color = summary.failed ? "red" : "brightgreen";
fs.mkdirSync("docs/assets", { recursive: true });
fs.writeFileSync("docs/assets/test-summary.json", JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(summary));
process.exit(summary.failed || !summary.tests ? 1 : 0);
