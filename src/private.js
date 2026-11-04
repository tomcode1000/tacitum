// Private assessment: the real counterparty is assessed alongside k-1 decoys, and every
// check of every bundle is shuffled together and spaced with random jitter, so the feed
// shows k complete, interleaved assessments and nothing marks which one was wanted.
import { CHECKS, runCheck, finish } from "./assess.js";
import { pickDecoys } from "./decoys.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export async function privateAssess(client, target, { k = 4, strategy = "matched", jitterMs = [0, 1500] } = {}) {
  const startedAt = new Date().toISOString();
  const decoys = await pickDecoys(target, k - 1, strategy);
  const parties = shuffle([target, ...decoys]);

  const tasks = shuffle(parties.flatMap((party) => Object.keys(CHECKS).map((check) => ({ party, check }))));
  const bought = new Map(parties.map((p) => [p, {}]));
  const order = [];
  for (const { party, check } of tasks) {
    await sleep(jitterMs[0] + Math.random() * (jitterMs[1] - jitterMs[0]));
    bought.get(party)[check] = await runCheck(client, CHECKS[check], party);
    order.push({ name: party.name, check });
  }

  const assessments = [];
  for (const party of parties) assessments.push(await finish(client, party, bought.get(party), startedAt));
  const real = assessments[parties.indexOf(target)];

  // Decoy results stay local. Only the real memo is reported; the decoys are cover.
  return {
    real,
    k,
    strategy,
    parties: parties.map((p) => p.name),
    targetIndex: parties.indexOf(target),
    order,
    costUsd: Number(assessments.reduce((s, a) => s + a.costUsd, 0).toFixed(4)),
    decoys: assessments.filter((a) => a !== real),
  };
}
