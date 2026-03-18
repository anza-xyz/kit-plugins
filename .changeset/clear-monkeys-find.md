---
'@solana/kit-plugin-rpc': patch
'@solana/kit-plugin-litesvm': patch
---

Replace `@solana-program/compute-budget` helpers with native `@solana/kit` transaction message helpers for compute budget management, removing the external dependency.
