// Local chain for the contract tests (test/pool-contract.test.mjs starts `hardhat node` with this).
// chainId matches Sepolia so EIP-712 signatures are built exactly as in production.
module.exports = {
  networks: {
    hardhat: { chainId: 11155111, hardfork: "cancun", mining: { auto: true }, accounts: { count: 6 } },
  },
};
