---
'@solana/kit-plugin-wallet': minor
---

Add `supportedTransactionVersions` to `getState().connected`, reporting the transaction versions the active account can sign as a `ReadonlySet<SolanaTransactionVersion>`. The value is intersected across every signing feature the account has, since the signer exposes one method per feature and the call site decides which one Kit uses, and is an empty set for accounts with no signing feature. Raises the `@solana/wallet-standard-features` requirement to `^1.5.0`, whose `SolanaTransactionVersion` adds v1.
