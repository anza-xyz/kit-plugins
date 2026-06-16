---
'@solana/kit-plugin-payer': patch
'@solana/kit-plugin-rpc': patch
---

Use `ExtendedClient` for the return type of `payerOrGeneratedPayer` (note: previously deprecated) and `solanaRpcConnection`. The resulting client shapes are structurally unchanged.