---
'@solana/kit-plugin-rpc': minor
'@solana/kit-plugin-litesvm': minor
'@solana/kit-plugin-airdrop': minor
'@solana/kit-client-rpc': patch
'@solana/kit-client-litesvm': patch
---

Add dedicated `rpcAirdrop` and `litesvmAirdrop` plugins to `@solana/kit-plugin-rpc` and `@solana/kit-plugin-litesvm` respectively, replacing the unified `airdrop` plugin that used runtime duck-typing to switch between strategies. The `litesvmAirdrop` plugin now throws a `SolanaError` on failure and returns the transaction signature on success. The `airdrop` export from `@solana/kit-plugin-airdrop` is deprecated in favor of the new dedicated plugins.
