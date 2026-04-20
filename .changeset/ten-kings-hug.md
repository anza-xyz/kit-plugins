---
'@solana/kit-plugin-rpc': minor
---

Add a read-only RPC pathway: `solanaRpcReadOnly()` plus the cluster convenience wrappers `solanaMainnetRpcReadOnly()`, `solanaDevnetRpcReadOnly()`, and `solanaLocalRpcReadOnly()` (and the matching `SolanaRpcReadOnlyConfig` type). These install `client.rpc`, `client.rpcSubscriptions`, and `client.getMinimumBalance` without the transaction-planning or transaction-sending plugins, so they have no `payer` prerequisite. The devnet and local variants also install `rpcAirdrop` (airdrop does not require a payer). Use for dashboards, explorers, on-chain watchers, and other read-only flows.
