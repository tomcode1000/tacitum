// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Tacitum screened pool.
//
// Desks deposit a fixed amount of USDC with a commitment. A deposit only becomes spendable once
// the screener has run the depositor's wallet through Telegraph's sanctions intent and it came
// back clear: approve() records the Telegraph signal hash of that screen, so anyone can re-check
// it against /engine/v1/signal/{hash}. Unscreened or failed deposits never enter the tree, so the
// approved set holds only screened money (the Privacy Pools idea, with Telegraph as the screen).
//
// Withdrawing proves, in zero knowledge, that the caller owns one approved deposit, and pays the
// money straight into a one-time payer's Telegraph escrow (depositUSDCFor). On chain the one-time
// payer is funded by this pool, not by the desk.

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    // EIP-3009: the pool pulls a signed authorization, so depositors need no ETH.
    function receiveWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external;
}

interface ITelegraphEscrow {
    function depositUSDCFor(address beneficiary, uint256 amount) external;
}

interface IPoseidon2 {
    function poseidon(uint256[2] calldata input) external pure returns (uint256);
}

interface IVerifier {
    function verifyProof(uint256[2] calldata a, uint256[2][2] calldata b, uint256[2] calldata c, uint256[5] calldata pub)
        external view returns (bool);
}

contract ScreenedPool {
    uint256 internal constant FIELD = 21888242871839275222987973346525843474722323733218440019324089856651904883201;
    uint32 public constant LEVELS = 16;
    uint32 public constant ROOT_HISTORY = 30;

    IERC20 public immutable usdc;
    ITelegraphEscrow public immutable escrow;
    IPoseidon2 public immutable hasher;
    IVerifier public immutable verifier;
    uint256 public immutable denomination;
    address public immutable screener;

    // Approved-set Merkle tree (incremental, Poseidon). Leaves are approved commitments only.
    uint256[LEVELS] public zeros;
    uint256[LEVELS] public filledSubtrees;
    uint256[ROOT_HISTORY] public roots;
    uint32 public currentRootIndex;
    uint32 public nextIndex;

    mapping(uint256 => address) public pendingDepositor; // commitment -> who paid, until screened
    mapping(uint256 => bool) public approved;
    mapping(uint256 => bool) public spent; // nullifierHash -> used

    event Deposited(uint256 indexed commitment, address indexed depositor);
    event Approved(uint256 indexed commitment, uint32 leafIndex, bytes32 screeningSignal, uint256 root);
    event Rejected(uint256 indexed commitment, address indexed depositor, bytes32 screeningSignal);
    event Withdrawn(address indexed recipient, uint256 nullifierHash, address relayer, uint256 fee);

    error NotScreener();
    error BadCommitment();
    error NotPending();
    error TreeFull();
    error UnknownRoot();
    error AlreadySpent();
    error BadProof();
    error FeeTooHigh();

    constructor(IERC20 _usdc, ITelegraphEscrow _escrow, IPoseidon2 _hasher, IVerifier _verifier, uint256 _denomination, address _screener) {
        usdc = _usdc;
        escrow = _escrow;
        hasher = _hasher;
        verifier = _verifier;
        denomination = _denomination;
        screener = _screener;

        uint256 z = 0;
        for (uint32 i = 0; i < LEVELS; i++) {
            zeros[i] = z;
            filledSubtrees[i] = z;
            z = _hash(z, z);
        }
        roots[0] = z;
        _usdc.approve(address(_escrow), type(uint256).max);
    }

    // Anyone can deposit; the money waits outside the approved set until screened.
    function deposit(uint256 commitment) external {
        _checkNew(commitment);
        pendingDepositor[commitment] = msg.sender;
        require(usdc.transferFrom(msg.sender, address(this), denomination), "transfer failed");
        emit Deposited(commitment, msg.sender);
    }

    // Gasless deposit: the depositor signs an EIP-3009 authorization whose nonce is
    // keccak256(commitment), so the signature can only ever fund this commitment. Anyone may
    // submit it (a relayer), and the depositor of record is the signer, who is the one screened.
    function depositWithAuthorization(uint256 commitment, address from, uint256 validAfter, uint256 validBefore, uint8 v, bytes32 r, bytes32 s) external {
        _checkNew(commitment);
        pendingDepositor[commitment] = from;
        usdc.receiveWithAuthorization(from, address(this), denomination, validAfter, validBefore, keccak256(abi.encode(commitment)), v, r, s);
        emit Deposited(commitment, from);
    }

    function _checkNew(uint256 commitment) internal view {
        if (commitment == 0 || commitment >= FIELD || approved[commitment] || pendingDepositor[commitment] != address(0)) revert BadCommitment();
    }

    // The depositor's wallet came back clear on Telegraph: add the deposit to the approved set.
    function approve(uint256 commitment, bytes32 screeningSignal) external {
        if (msg.sender != screener) revert NotScreener();
        if (pendingDepositor[commitment] == address(0)) revert NotPending();
        delete pendingDepositor[commitment];
        approved[commitment] = true;
        uint32 index = _insert(commitment);
        emit Approved(commitment, index, screeningSignal, roots[currentRootIndex]);
    }

    // The screen flagged the depositor: the money goes back and never mixes with the pool.
    function reject(uint256 commitment, bytes32 screeningSignal) external {
        if (msg.sender != screener) revert NotScreener();
        address depositor = pendingDepositor[commitment];
        if (depositor == address(0)) revert NotPending();
        delete pendingDepositor[commitment];
        require(usdc.transfer(depositor, denomination), "refund failed");
        emit Rejected(commitment, depositor, screeningSignal);
    }

    function withdraw(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256 root,
        uint256 nullifierHash,
        address recipient,
        address relayer,
        uint256 fee
    ) external {
        if (fee > denomination) revert FeeTooHigh();
        if (spent[nullifierHash]) revert AlreadySpent();
        if (!isKnownRoot(root)) revert UnknownRoot();
        uint256[5] memory pub = [root, nullifierHash, uint256(uint160(recipient)), uint256(uint160(relayer)), fee];
        if (!verifier.verifyProof(a, b, c, pub)) revert BadProof();
        spent[nullifierHash] = true;

        escrow.depositUSDCFor(recipient, denomination - fee);
        if (fee > 0) require(usdc.transfer(relayer, fee), "fee failed");
        emit Withdrawn(recipient, nullifierHash, relayer, fee);
    }

    function isKnownRoot(uint256 root) public view returns (bool) {
        if (root == 0) return false;
        uint32 i = currentRootIndex;
        do {
            if (roots[i] == root) return true;
            i = i == 0 ? ROOT_HISTORY - 1 : i - 1;
        } while (i != currentRootIndex);
        return false;
    }

    function latestRoot() external view returns (uint256) {
        return roots[currentRootIndex];
    }

    function _insert(uint256 leaf) internal returns (uint32 index) {
        index = nextIndex;
        if (index >= uint32(1) << LEVELS) revert TreeFull();
        uint32 cur = index;
        uint256 node = leaf;
        for (uint32 i = 0; i < LEVELS; i++) {
            if (cur % 2 == 0) {
                filledSubtrees[i] = node;
                node = _hash(node, zeros[i]);
            } else {
                node = _hash(filledSubtrees[i], node);
            }
            cur /= 2;
        }
        currentRootIndex = (currentRootIndex + 1) % ROOT_HISTORY;
        roots[currentRootIndex] = node;
        nextIndex = index + 1;
    }

    function _hash(uint256 l, uint256 r) internal view returns (uint256) {
        return hasher.poseidon([l, r]);
    }
}
