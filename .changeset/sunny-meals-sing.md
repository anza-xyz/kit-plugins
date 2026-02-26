---
'@solana/kit-plugin-litesvm': patch
---

Remove provisory compute unit limit from LiteSVM planner

The LiteSVM planner no longer adds a provisory `SetComputeUnitLimit` instruction. This sentinel value (0 CU) was meant to be replaced by a real estimate in the executor, but the LiteSVM executor never performed estimation — causing transactions to fail with "compute budget exceeded". LiteSVM does not enforce compute unit limits by default, so the instruction is unnecessary.
