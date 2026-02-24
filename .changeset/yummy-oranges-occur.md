---
'@solana/kit-plugin-litesvm': minor
---

Throw `SolanaError` when LiteSVM `sendTransaction` fails

The LiteSVM transaction plan executor now detects failed transactions and throws a `SolanaError` with the same error codes the RPC executor produces. Previously, failed transactions were silently ignored because LiteSVM's `sendTransaction` returns a result object rather than throwing.

A new `getSolanaErrorFromLiteSvmFailure` helper converts LiteSVM's `FailedTransactionMetadata` into the RPC-compatible error format using duck typing (no native module import in browser bundles).
