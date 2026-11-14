pragma circom 2.1.6;

// Tacitum screened pool: withdraw proof.
//
// A deposit is commitment = Poseidon(nullifier, secret). Only deposits whose depositor passed
// Telegraph sanctions screening are inserted into the approved tree, so a valid proof says:
// "this money came from one of the approved deposits", without saying which one.
//
// Public:  root (of the approved tree), nullifierHash (stops double spend), recipient (the
//          one-time payer the pool funds), relayer and fee (who sent the transaction, and what
//          they are paid). recipient/relayer/fee are bound so a watcher cannot swap them.
// Private: nullifier, secret, the Merkle path.

include "../node_modules/circomlib/circuits/poseidon.circom";

// Hash one tree level: if the path bit is 1, the current node is the right child.
template HashLevel() {
    signal input node;
    signal input sibling;
    signal input isRight;
    signal output out;

    isRight * (1 - isRight) === 0;
    signal left <== node + isRight * (sibling - node);
    signal right <== sibling + isRight * (node - sibling);

    component h = Poseidon(2);
    h.inputs[0] <== left;
    h.inputs[1] <== right;
    out <== h.out;
}

template Withdraw(levels) {
    signal input root;
    signal input nullifierHash;
    signal input recipient;
    signal input relayer;
    signal input fee;

    signal input nullifier;
    signal input secret;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    component commit = Poseidon(2);
    commit.inputs[0] <== nullifier;
    commit.inputs[1] <== secret;

    component nh = Poseidon(1);
    nh.inputs[0] <== nullifier;
    nh.out === nullifierHash;

    component lvl[levels];
    signal node[levels + 1];
    node[0] <== commit.out;
    for (var i = 0; i < levels; i++) {
        lvl[i] = HashLevel();
        lvl[i].node <== node[i];
        lvl[i].sibling <== pathElements[i];
        lvl[i].isRight <== pathIndices[i];
        node[i + 1] <== lvl[i].out;
    }
    node[levels] === root;

    // Bind the public outputs into the proof (unused signals could otherwise be altered).
    signal recipientSq <== recipient * recipient;
    signal relayerSq <== relayer * relayer;
    signal feeSq <== fee * fee;
}

component main { public [root, nullifierHash, recipient, relayer, fee] } = Withdraw(16);
