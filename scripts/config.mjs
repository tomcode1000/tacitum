// Repo scripts: load .env first, then the library config (which reads process.env at import).
import "dotenv/config";
import { privateKeyToAccount } from "viem/accounts";

export * from "../src/config.js";

export function loadAccount() {
  const key = process.env.PRIVATE_KEY;
  if (!key) throw new Error("PRIVATE_KEY missing. Run `npm run wallet` first.");
  return privateKeyToAccount(key);
}
