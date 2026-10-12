---
'@solana/kit-plugin-wallet': patch
---

Fix the `SOLANA_ERROR__WALLET__ACCOUNT_NOT_AVAILABLE` error thrown by `selectAccount`, which was missing its `address` and `walletName` context, so its message rendered as `Account $address is not available in wallet "$walletName"`.
