---
'@solana/kit-plugin-instruction-plan': minor
'@solana/kit-plugin-litesvm': minor
'@solana/kit-plugin-rpc': minor
'@solana/kit-plugin-signer': minor
'@solana/kit-plugin-wallet': minor
---

Upgrade to Kit v8. All packages now require `@solana/kit@^8.0.0` as a peer dependency, and the wallet plugin additionally requires `@solana/react@^8.0.0` and `@solana/wallet-account-signer@^8.0.0`. Following Kit v8's redesign of transaction plan result contexts, the `transactionPlanSendingExecutor` plugin now propagates the executor's result context type to the `sendTransaction` and `sendTransactions` functions it installs, and the executor plugins default their context to `TransactionPlanResultContextWithSignature` so successful results keep a typed `context.signature` out of the box.
