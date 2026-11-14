# Milestone drafts (14 Nov)

Figures: v5 privacy experiment (13 Nov) and the first pool-paid assessment (14 Nov).

## To the Telegraph mod

> Tacitum, 14 Nov checkpoint. You asked for privacy, verifiable purchases, an institutional workflow and audit-friendly pooled funding together. Here is where each stands on testnet:
>
> - Workflow: a counterparty assessment (sanctions from two miners, registry, filings, news) bought among 3 matched decoys. Every attacker we built, including one that watches across runs, picks the real party at chance: 0.25 with k=4 (95% CI 0.10–0.49, 16 live runs).
> - Pooled funding: a screened pool on Sepolia. Each depositor wallet is screened through Telegraph sanctions (miner 731002) before its deposit can be spent, and the signal hash is stored on chain with the approval. A Groth16 proof then funds a one-time payer's escrow via depositUSDCFor, so the payer is funded by the pool, not the desk.
> - Verifiable: first pool-paid memo (Barclays PLC), 5/5 receipts verified against /engine/v1/signal.
> - Next: auditor view keys (P5) and a bigger anonymity set. Other Season II teams are welcome to deposit.
>
> Repo: https://github.com/tomcode1000/tacitum. Two notes that may help others: a payer called seconds after funding stays at available=0 until epoch close, and fresh signals return 404 for a few minutes before they publish.

## For X (277/280 characters)

> Every paid Telegraph question is public: question, answer and the wallet that paid. A desk screening a counterparty shows its hand.
>
> I'm building Tacitum for the @Telegraphprotoc hackathon: real checks hide among decoys, paid via a sanctions-screened pool.
>
> #TelegraphHackathon
