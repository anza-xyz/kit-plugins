---
'@solana/kit-client-litesvm': patch
---

Re-export `LiteSVM`, `LiteSvmRpcApi`, `FailedTransactionMetadata`, and `TransactionMetadata` types from `@solana/kit-plugin-litesvm` to make the `createClient` return type portable.
