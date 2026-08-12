---
'@solana/kit-plugin-instruction-plan': minor
'@solana/kit-plugin-litesvm': minor
'@solana/kit-plugin-rpc': minor
---

Plugins that install a transaction planner or executor now also install the client functions that use them.

The `transactionPlanner` plugin now adds `planTransaction` and `planTransactions` to the client, and a new `transactionPlanSendingExecutor` plugin adds `sendTransaction` and `sendTransactions`, planning through the client's planning functions. As a result, `planAndSendTransactions` is no longer needed and is deprecated, along with the `transactionPlanExecutor` plugin and the `client.transactionPlanner` and `client.transactionPlanExecutor` fields.

`@solana/kit-plugin-rpc` and `@solana/kit-plugin-litesvm` keep their `rpcTransactionPlanner` and `litesvmTransactionPlanner` plugins, which now install `planTransaction` and `planTransactions` rather than just the planner field. They also gain `rpcTransactionPlanSendingExecutor` and `litesvmTransactionPlanSendingExecutor`, which install `sendTransaction` and `sendTransactions` and must therefore be applied after a transaction planner. The previous `rpcTransactionPlanExecutor` and `litesvmTransactionPlanExecutor` plugins are deprecated in their favour and keep their existing behaviour of only setting the `transactionPlanExecutor` field.

All deprecated exports keep working unchanged.
