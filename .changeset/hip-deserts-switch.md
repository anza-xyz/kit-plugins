---
'@solana/kit-plugin-litesvm': patch
---

Fix `getAccountInfo` and `getMultipleAccounts` on the LiteSVM RPC silently ignoring the `dataSlice` config option. Both now return the requested byte range while preserving the account's full `space`, matching `getProgramAccounts` and the Solana JSON-RPC API.
