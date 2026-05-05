---
'@solana/kit-plugin-rpc': patch
---

Fix `solanaRpcConnection` WebSocket URL derivation for the canonical local validator endpoint. When `rpcUrl` is `http://127.0.0.1:8899` or `http://localhost:8899`, the derived `rpcSubscriptionsUrl` now correctly targets port `8900` to match `solana-test-validator` defaults. Non-default ports and remote endpoints are unchanged.
