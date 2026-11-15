// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Test stand-ins for Sepolia's test USDC (ERC-20 + EIP-3009 receiveWithAuthorization, EIP-712
// domain "USD Coin" v2) and Telegraph's escrow (depositUSDCFor). Used only by the contract tests.

contract MockUSDC {
    string public constant name = "USD Coin";
    string public constant version = "2";
    uint8 public constant decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => mapping(bytes32 => bool)) public authorizationState;

    bytes32 constant RECEIVE_TYPEHASH = keccak256("ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");

    function DOMAIN_SEPARATOR() public view returns (bytes32) {
        return keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes(name)), keccak256(bytes(version)), block.chainid, address(this)));
    }

    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function approve(address spender, uint256 amount) external returns (bool) { allowance[msg.sender][spender] = amount; return true; }
    function transfer(address to, uint256 amount) external returns (bool) { _move(msg.sender, to, amount); return true; }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (allowance[from][msg.sender] != type(uint256).max) allowance[from][msg.sender] -= amount;
        _move(from, to, amount);
        return true;
    }

    function receiveWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external {
        require(to == msg.sender, "caller must be the payee");
        require(block.timestamp > validAfter && block.timestamp < validBefore, "authorization not valid now");
        require(!authorizationState[from][nonce], "authorization used");
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR(), keccak256(abi.encode(RECEIVE_TYPEHASH, from, to, value, validAfter, validBefore, nonce))));
        require(ecrecover(digest, v, r, s) == from, "invalid signature");
        authorizationState[from][nonce] = true;
        _move(from, to, value);
    }

    function _move(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}

interface IERC20Min { function transferFrom(address, address, uint256) external returns (bool); }

contract MockEscrow {
    IERC20Min public immutable usdc;
    mapping(address => uint256) public effectiveBalance;
    constructor(IERC20Min _usdc) { usdc = _usdc; }
    function depositUSDCFor(address beneficiary, uint256 amount) external {
        require(usdc.transferFrom(msg.sender, address(this), amount), "pull failed");
        effectiveBalance[beneficiary] += amount;
    }
}
