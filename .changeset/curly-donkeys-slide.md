---
'@solana/kit-plugin-wallet': patch
---

Fix `client.wallet.getState().wallets` not reflecting accounts authorized during connect/signIn/reconnect until an unrelated wallet event fired.
