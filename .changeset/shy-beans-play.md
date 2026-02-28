---
'@solana/kit-plugin-litesvm': patch
---

Add `getBalance`, `getEpochSchedule`, `getMinimumBalanceForRentExemption`, `getSlot`, and `requestAirdrop` RPC methods to the LiteSVM plugin. Extract the LiteSVM-to-RPC adapter into its own `createRpcFromSvm` function.
