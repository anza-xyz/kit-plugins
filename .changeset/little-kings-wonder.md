---
'@solana/kit-plugin-instruction-plan': minor
---

Add a new `client.sendTransaction` helper in the `sendTransactions` plugin. This helper ensures only a single transaction is executed, regardless of the number of instructions provided. Should these instructions not fit in a transaction, an error will be thrown.
