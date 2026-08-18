---
'@solana/kit-plugin-instruction-plan': minor
'@solana/kit-plugin-litesvm': minor
'@solana/kit-plugin-rpc': minor
'@solana/kit-plugin-signer': minor
'@solana/kit-plugin-wallet': minor
---

Update Kit dependency to v7.1.0.

The `rpcTransactionPlanSendingExecutor` and `litesvmTransactionPlanSendingExecutor` executors now report the result context directly instead of returning a transaction, which Kit deprecated in v7.1.0. Each package also exports a type naming the context its executor produces (`RpcSendContext` and `LiteSvmSendContext` respectively) — the planned message with its blockhash lifetime, the signature, the fully signed transaction, and, for LiteSVM, the transaction metadata — so plan results can be annotated without asserting on Kit's optional base fields. Successful results carry the same values as before, so no changes are required.
