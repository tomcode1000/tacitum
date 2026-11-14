// Circuit + tree tests (no chain needed). Run: node --test test/
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { newNote, Tree, prove, verifyLocally, shutdown } from "../src/pool.js";

after(shutdown);

const recipient = "0x00000000000000000000000000000000000000a1";
const relayer = "0x00000000000000000000000000000000000000b2";

const notes = await Promise.all([newNote(), newNote(), newNote()]);
const tree = await Tree.create(notes.map((n) => n.commitment));

test("a member of the approved set can withdraw", async () => {
  const p = await prove(notes[1], tree, 1, { recipient, relayer, fee: 0n });
  assert.equal(await verifyLocally(p.proof, p.publicSignals), true);
  assert.equal(p.publicSignals[0], tree.root.toString());
  assert.equal(p.publicSignals[1], notes[1].nullifierHash.toString());
});

test("the proof is bound to its recipient and fee", async () => {
  const p = await prove(notes[0], tree, 0, { recipient, relayer, fee: 5n });
  const swapped = [...p.publicSignals];
  swapped[2] = BigInt("0x00000000000000000000000000000000000000c3").toString();
  assert.equal(await verifyLocally(p.proof, swapped), false, "recipient swap must fail");
  const fee = [...p.publicSignals];
  fee[4] = "999";
  assert.equal(await verifyLocally(p.proof, fee), false, "fee change must fail");
});

test("a note that was never approved cannot prove membership", async () => {
  const outsider = await newNote();
  await assert.rejects(prove(outsider, tree, 2, { recipient, relayer }), "proving with a non-member must fail");
});

test("tree root matches an independent rebuild after more inserts", async () => {
  const more = await newNote();
  const t2 = await Tree.create([...notes.map((n) => n.commitment), more.commitment]);
  assert.notEqual(t2.root, tree.root);
  const p = await prove(more, t2, 3, { recipient, relayer });
  assert.equal(await verifyLocally(p.proof, p.publicSignals), true);
});
