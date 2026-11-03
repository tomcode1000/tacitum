// Usage: npm run assess -- "Barclays PLC" GB
import fs from "node:fs";
import { loadAccount } from "./config.mjs";
import { createClient } from "../src/telegraph.js";
import { assess } from "../src/assess.js";
import { renderMemo } from "../src/memo.js";

const [name, jurisdiction = "GB"] = process.argv.slice(2);
if (!name) {
  console.error('Usage: npm run assess -- "<company name>" <jurisdiction>');
  process.exit(1);
}

const result = await assess(createClient(loadAccount()), { name, jurisdiction });
const memo = renderMemo(result);

const slug = `${new Date().toISOString().slice(0, 10)}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
fs.mkdirSync("assessments", { recursive: true });
fs.writeFileSync(`assessments/${slug}.json`, JSON.stringify(result, null, 2));
fs.writeFileSync(`assessments/${slug}.md`, memo);

console.log(memo);
console.log(`Saved assessments/${slug}.md and .json`);
