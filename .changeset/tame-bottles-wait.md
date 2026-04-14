---
'@solana/kit-plugin-rpc': minor
'@solana/kit-plugin-litesvm': minor
---

Replace the `priorityFees` config option on `rpcTransactionPlanner` and `litesvmTransactionPlanner` with a new `TransactionPlannerConfig` object that supports `microLamportsPerComputeUnit` and `version`. Add a `transactionConfig` option to `solanaRpc` and `litesvm` for passing transaction planner configuration through the all-in-one plugins.

**BREAKING CHANGES**

**`priorityFees` replaced with `TransactionPlannerConfig`.** The inline `priorityFees` option has been replaced with a `TransactionPlannerConfig` object. The `priorityFees` option on `SolanaRpcConfig` has been replaced with `transactionConfig`.

```diff
- rpcTransactionPlanner({ priorityFees: 100n as MicroLamports })
+ rpcTransactionPlanner({ microLamportsPerComputeUnit: 100n as MicroLamports })
```

```diff
- solanaRpc({ url, priorityFees: 100n as MicroLamports })
+ solanaRpc({ url, transactionConfig: { microLamportsPerComputeUnit: 100n as MicroLamports } })
```
