---
'@solana/kit-plugin-rpc': minor
'@solana/kit-react': minor
---

Add a read-only RPC pathway. `@solana/kit-plugin-rpc` gains `solanaRpcReadOnly()` (and `SolanaRpcReadOnlyConfig`) — a plugin that installs `client.rpc`, `client.rpcSubscriptions`, and `client.getMinimumBalance` without the transaction-planning or transaction-sending halves, so it has no `payer` prerequisite. `@solana/kit-react` gains the matching `RpcReadOnlyProvider` for dashboards, explorers, watchers, and other flows that only read from the chain.
