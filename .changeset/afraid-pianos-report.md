---
'@solana/kit-plugin-rpc': patch
---

Remove redundant `unwrapSimulationError` call from the default RPC executor. Simulation errors are now unwrapped by `sendTransaction` and `sendTransactions` instead.
