---
'@solana/kit-plugin-rpc': minor
'@solana/kit-plugin-litesvm': minor
---

Create version 1 transaction messages by default in `rpcTransactionPlanner` and `litesvmTransactionPlanner`.

**BREAKING CHANGES**

**Transaction planners now default to version 1.** Omitting `version` now creates version 1 transaction messages instead of version 0, including through the `transactionConfig` option on `solanaRpc` and `litesvm`. Version 1 transactions store resource limits and priority fees in a structured resource header rather than compute budget instructions, so they no longer cost message bytes or instruction slots. Priority fees are now expressed as a total amount in lamports via `priorityFeeLamports`, replacing the per-compute-unit `microLamportsPerComputeUnit`.

```diff
- rpcTransactionPlanner({ microLamportsPerComputeUnit: 100n as MicroLamports })
+ rpcTransactionPlanner({ priorityFeeLamports: 10_000n as Lamports })
```

```diff
- solanaRpc({ rpcUrl, transactionConfig: { microLamportsPerComputeUnit: 100n as MicroLamports } })
+ solanaRpc({ rpcUrl, transactionConfig: { priorityFeeLamports: 10_000n as Lamports } })
```

Apps that still need legacy or version 0 messages, such as those whose wallets cannot sign version 1 transactions yet, can opt out with `version: 0` or `version: 'legacy'`.
