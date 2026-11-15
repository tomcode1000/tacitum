// P5: audit records. Each private assessment is sealed to an auditor's public key, so the full
// record (the real target, every decoy, every receipt, the payer and the pool deposit that funded
// it) can be published as ciphertext and opened only by whoever holds the viewing key.
//
//   seal:    X25519 (ephemeral) -> HKDF-SHA256 -> AES-256-GCM, plaintext hash kept in the envelope
//   open:    the auditor's private key reverses it and checks the hash
//   verify:  the auditor re-checks every claim against public data on their own: Telegraph signal
//            records for each receipt, and for pool funding the deposit, the screening approval and
//            the withdraw on chain, recomputing the note's commitment and nullifier hash.
import crypto from "node:crypto";
import { parseAbiItem, parseEventLogs } from "viem";
import { publicClient, logsClient } from "./config.js";
import { publicRecord } from "./telegraph.js";

const INFO = Buffer.from("tacitum-audit-v1");
const b64 = (b) => Buffer.from(b).toString("base64url");
const unb64 = (s) => Buffer.from(s, "base64url");

// Raw 32-byte X25519 keys, base64url. The public key goes in AUDITOR_PUBKEY; the private key is
// handed to the auditor and never stored with the desk's data.
export function auditorKeygen() {
  const jwk = crypto.generateKeyPairSync("x25519").privateKey.export({ format: "jwk" });
  return { publicKey: jwk.x, privateKey: jwk.d };
}

const pubKeyObj = (raw) => crypto.createPublicKey({ key: { kty: "OKP", crv: "X25519", x: raw }, format: "jwk" });
const privKeyObj = (rawPriv, rawPub) => crypto.createPrivateKey({ key: { kty: "OKP", crv: "X25519", d: rawPriv, x: rawPub }, format: "jwk" });
export const fingerprint = (pub) => crypto.createHash("sha256").update(unb64(pub)).digest("hex").slice(0, 16);

function derive(shared, ephPub, audPub) {
  return Buffer.from(crypto.hkdfSync("sha256", shared, Buffer.concat([unb64(ephPub), unb64(audPub)]), INFO, 32));
}

export function seal(record, auditorPub) {
  const plain = Buffer.from(JSON.stringify(record, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
  const eph = crypto.generateKeyPairSync("x25519");
  const ephPub = eph.publicKey.export({ format: "jwk" }).x;
  const shared = crypto.diffieHellman({ privateKey: eph.privateKey, publicKey: pubKeyObj(auditorPub) });
  const key = derive(shared, ephPub, auditorPub);
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(INFO);
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return {
    v: 1,
    alg: "X25519-HKDF-SHA256-AES-256-GCM",
    auditor: fingerprint(auditorPub),
    eph: ephPub,
    iv: b64(iv),
    tag: b64(c.getAuthTag()),
    ct: b64(ct),
    sha256: crypto.createHash("sha256").update(plain).digest("hex"),
    sealedAt: new Date().toISOString(),
  };
}

export function open(envelope, auditorPriv, auditorPub) {
  if (envelope.v !== 1) throw new Error(`unknown audit envelope version ${envelope.v}`);
  if (fingerprint(auditorPub) !== envelope.auditor) throw new Error("this record was sealed for a different auditor key");
  const shared = crypto.diffieHellman({ privateKey: privKeyObj(auditorPriv, auditorPub), publicKey: pubKeyObj(envelope.eph) });
  const key = derive(shared, envelope.eph, auditorPub);
  const d = crypto.createDecipheriv("aes-256-gcm", key, unb64(envelope.iv));
  d.setAAD(INFO);
  d.setAuthTag(unb64(envelope.tag));
  const plain = Buffer.concat([d.update(unb64(envelope.ct)), d.final()]);
  if (crypto.createHash("sha256").update(plain).digest("hex") !== envelope.sha256) throw new Error("audit record hash mismatch");
  return JSON.parse(plain.toString("utf8"));
}

// Builds the record an auditor needs from a saved run and its funding.
export function auditRecord({ run, desk, funding }) {
  return {
    kind: "tacitum-audit",
    version: 1,
    desk,
    counterparty: run.real.counterparty,
    finishedAt: run.real.finishedAt,
    overall: run.real.overall,
    verdicts: run.real.verdicts,
    parties: run.parties,
    real: run.parties[run.targetIndex],
    payer: run.real.payer,
    costUsd: run.costUsd,
    calls: [run.real, ...run.decoys].map((a) => ({
      party: a.counterparty.name,
      real: a.counterparty.name === run.parties[run.targetIndex],
      answers: Object.entries(a.checks).flatMap(([check, c]) => c.answers.filter((x) => x.signal).map((x) => ({ check, minerId: x.minerId, signal: x.signal, tx: x.tx || null }))),
    })),
    funding,
  };
}

const ev = {
  deposited: parseAbiItem("event Deposited(uint256 indexed commitment, address indexed depositor)"),
  approved: parseAbiItem("event Approved(uint256 indexed commitment, uint32 leafIndex, bytes32 screeningSignal, uint256 root)"),
  withdrawn: parseAbiItem("event Withdrawn(address indexed recipient, uint256 nullifierHash, address relayer, uint256 fee)"),
};

// The auditor's independent check of an opened record. Returns one line per claim.
export async function verifyRecord(rec, { waitMs = 0 } = {}) {
  const lines = [];
  const ok = (pass, what) => lines.push({ pass, what });

  for (const call of rec.calls) {
    for (const a of call.answers) {
      const pub = await publicRecord(a.signal, { waitMs });
      ok(Boolean(pub) && pub.signal?.wallet_address?.toLowerCase() === rec.payer.toLowerCase(),
        `${call.real ? "REAL " : "decoy"} ${call.party.padEnd(28)} ${a.check.padEnd(9)} receipt ${a.signal.slice(0, 12)}… paid by the payer`);
    }
  }

  const f = rec.funding || {};
  if (f.viaPool && f.note) {
    const { buildPoseidon } = await import("circomlibjs");
    const p = await buildPoseidon();
    const H = (...xs) => p.F.toObject(p(xs.map(BigInt)));
    const commitment = H(f.note.nullifier, f.note.secret);
    const nullHash = H(f.note.nullifier);
    ok(commitment.toString() === String(f.note.commitment), "note opens to the stated commitment");

    const scan = async (event, args) => {
      const latest = await logsClient.getBlockNumber();
      for (let from = BigInt(f.poolDeployBlock); from <= latest; from += 9000n) {
        const to = from + 8999n > latest ? latest : from + 8999n;
        const logs = await logsClient.getLogs({ address: f.pool, event, args, fromBlock: from, toBlock: to });
        if (logs.length) return logs[0];
      }
      return null;
    };
    const dep = await scan(ev.deposited, { commitment });
    ok(dep && dep.args.depositor.toLowerCase() === String(f.note.depositor).toLowerCase(), `deposit by the desk's wallet ${String(f.note.depositor).slice(0, 10)}… (tx ${dep?.transactionHash?.slice(0, 12)}…)`);
    const appr = await scan(ev.approved, { commitment });
    ok(Boolean(appr), `deposit approved after screening (signal ${appr?.args.screeningSignal?.slice(0, 12)}…)`);
    if (appr) {
      const scr = await publicRecord(appr.args.screeningSignal, { waitMs });
      const matched = scr?.payload?.response?.matched ?? scr?.result?.execution?.result?.matched;
      ok(Boolean(scr) && String(matched) === "false", "screening receipt on Telegraph says the depositor is not sanctioned");
    }
    const wtx = await publicClient.getTransactionReceipt({ hash: f.withdrawTx });
    const withdrawn = parseEventLogs({ abi: [ev.withdrawn], logs: wtx.logs }).find((l) => l.address.toLowerCase() === f.pool.toLowerCase());
    ok(withdrawn?.args.nullifierHash === nullHash, "withdraw spent exactly this note (nullifier hash matches)");
    ok(withdrawn?.args.recipient.toLowerCase() === rec.payer.toLowerCase(), "withdraw funded the payer that bought every receipt");
  } else if (f.fundingTx) {
    ok(true, `payer funded directly by ${f.funder} (tx ${f.fundingTx.slice(0, 12)}…): not pool-funded`);
  }
  return { pass: lines.every((l) => l.pass), lines };
}

// Funding facts for a payer, from its saved key record (TACITUM_KEYS/<payer>.json). For a pool
// payer this includes the spent note, which lets the auditor prove which deposit paid.
export async function fundingFor(payerAddress, poolInfo) {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { KEYS } = await import("./config.js");
  const file = path.join(KEYS, `${payerAddress}.json`);
  if (!fs.existsSync(file)) return { known: false };
  const rec = JSON.parse(fs.readFileSync(file, "utf8"));
  const viaPool = Boolean(poolInfo && rec.funder?.toLowerCase() === poolInfo.pool.toLowerCase());
  const base = { viaPool, funder: rec.funder, fundingTx: rec.fundingTx, amountUsd: rec.amountUsd };
  if (!viaPool) return base;
  let note = null;
  if (rec.note && fs.existsSync(rec.note)) {
    const n = JSON.parse(fs.readFileSync(rec.note, "utf8"));
    note = { commitment: n.commitment, nullifier: n.nullifier, secret: n.secret, nullifierHash: n.nullifierHash, depositor: n.depositor, depositTx: n.depositTx };
  }
  return { ...base, pool: poolInfo.pool, poolDeployBlock: poolInfo.deployBlock, withdrawTx: rec.fundingTx, note };
}
