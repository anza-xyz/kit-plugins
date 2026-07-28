---
'@solana/kit-plugin-rpc': minor
'@solana/kit-plugin-litesvm': minor
'@solana/kit-plugins': minor
---

Add resource limit estimation controls and a configurable compute unit buffer to the RPC transaction plan executor, and reshape the transaction planner config for version 1 support.

Resource limit estimation on the RPC plugin can now be turned off via `estimateResourceLimits: false`, which is useful for transactions close to the message size limit where adding a compute budget instruction would make an otherwise valid transaction too large. This flag applies to both the planner and the executor, and `solanaRpc` reads it from a single location (`transactionConfig`). Disabling estimation does not disable preflight; set `skipPreflight: true` as well to avoid all simulation.

The compute unit buffer applied to estimates is now configurable via a new `getComputeUnitLimitFromEstimate` option on `rpcTransactionPlanExecutor` (also surfaced on `solanaRpc`). The previous flat 10% buffer is replaced by a default function that adds a buffer on top of the estimate of at least 300 compute units, or a margin that decays linearly from 10% at low estimates to 2% at 500,000 compute units and above, whichever is greater. The buffer is applied on both successful estimation and the `skipPreflight` recovery path, and the resulting compute unit limit is always capped at 1,400,000 (the per-transaction maximum).

The transaction planner config (`TransactionPlannerConfig`) on both the RPC and LiteSVM plugins is now a version-discriminated union in preparation for version 1 transactions, which store resource limits and priority fees in a structured resource header rather than compute budget instructions. Version 1 is defined at the type level but is not yet buildable by `@solana/kit`, so passing `version: 1` currently throws.
