---
'@solana/kit-plugin-litesvm': minor
'@solana/kit-plugin-rpc': patch
'@solana/kit-plugin-payer': patch
'@solana/kit-client-litesvm': patch
---

Adopt `ClientWith*` helper types from `@solana/kit` across plugins and replace `RpcFromLiteSVM` with `LiteSvmRpcApi`.

#### Breaking changes

- **`@solana/kit-plugin-litesvm`**: Removed the `RpcFromLiteSVM` type. Use `ClientWithRpc<LiteSvmRpcApi>` from `@solana/kit` with the new `LiteSvmRpcApi` type instead.

#### New features

- **`@solana/kit-plugin-litesvm`**: Added `LiteSvmRpcApi` type representing the RPC API methods available on a LiteSVM-backed client.
