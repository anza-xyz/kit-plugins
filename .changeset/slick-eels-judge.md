---
'@solana/kit-plugin-litesvm': minor
---

Add `GetProgramAccountsApi` support to litesvm Rpc

The LiteSVM-backed `Rpc` now implements `getProgramAccounts`, supporting `dataSize`/`memcmp` filters, `dataSlice`, and `withContext`. Account data is returned as `base64`, consistent with the other supported methods; requesting any other encoding throws.