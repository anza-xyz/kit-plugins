---
'@solana/kit-plugin-litesvm': patch
---

The LiteSVM transaction plan executor now exposes a typed `context.transactionMetadata` property on the plan result, containing the `TransactionMetadata` (or `FailedTransactionMetadata` on failure) returned by LiteSVM's `sendTransaction`. This allows consumers to inspect transaction logs, compute units consumed, return data, and other metadata directly from the plan result. The `TransactionMetadata` and `FailedTransactionMetadata` types are also re-exported from the package. Additionally, the executor now uses the real `LiteSVM` type from `@loris-sandbox/litesvm-kit` via type-only imports instead of a local duck type.
