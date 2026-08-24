---
'@solana/kit-plugin-litesvm': minor
'@solana/kit-plugin-rpc': minor
---

Support version 1 transactions in the transaction planners. Passing `version: 1` to `litesvmTransactionPlanner` or `rpcTransactionPlanner` no longer throws: the planners now build version 1 transaction messages, write `priorityFeeLamports` to the version 1 resource header when configured, and — for the RPC planner — reserve provisory compute unit and loaded accounts data size limits for the executor to estimate. The default version remains 0.
