---
'@solana/kit-plugin-instruction-plan': minor
'@solana/kit-plugin-rpc': minor
---

Added the `ClientWithTransactionSigning` capability. `@solana/kit-plugin-instruction-plan` gains three plugins, each naming a single capability and taking its planner and executor explicitly rather than reading them off the client: `transactionPlanning` adds `planTransaction`/`planTransactions`, `transactionSigning` adds `signTransaction`/`signTransactions`, and `transactionSending` adds `sendTransaction`/`sendTransactions`. `@solana/kit-plugin-rpc` gains `createRpcTransactionSigningExecutor` and `createRpcTransactionSendingExecutor`, which share their blockhash and resource-limit estimation behaviour and differ only in that signing signs partially and stops short of broadcasting. `solanaRpc` clients now expose the signing functions. `rpcTransactionPlanExecutor` and `planAndSendTransactions` are deprecated in favour of passing executors explicitly, and both keep working unchanged; a `solanaRpc` client still carries `transactionPlanExecutor`, now deprecated.
