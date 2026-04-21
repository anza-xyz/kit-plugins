---
'@solana/kit-plugin-rpc': minor
---

Merge the `rpc` and `rpcSubscriptions` setup into a single `solanaRpcConnection` plugin.

`solanaRpcConnection` now takes a configuration object and installs both `client.rpc` and `client.rpcSubscriptions` in one call, deriving the WebSocket URL from the RPC URL when `rpcSubscriptionsUrl` is not provided.

```diff
- createClient()
-     .use(solanaRpcConnection('https://api.mainnet-beta.solana.com'))
-     .use(solanaRpcSubscriptionsConnection('wss://api.mainnet-beta.solana.com'));
+ createClient()
+     .use(solanaRpcConnection({ rpcUrl: 'https://api.mainnet-beta.solana.com' }));
```

As a result, the following helpers are now soft-deprecated:

- `rpcConnection` and `rpcSubscriptionsConnection`: trivial wrappers around `extendClient` — inline `extendClient({ rpc })` / `extendClient({ rpcSubscriptions })` instead, or use `solanaRpcConnection` when starting from a cluster URL.
- `solanaRpcSubscriptionsConnection`: no longer needed because `solanaRpcConnection` installs both `rpc` and `rpcSubscriptions`.

The new `SolanaRpcConnectionConfig` type groups the RPC/subscription URL and transport options together and is reused by `SolanaRpcConfig`.
