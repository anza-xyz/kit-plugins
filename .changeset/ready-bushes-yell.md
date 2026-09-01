---
'@solana/kit-plugin-wallet': patch
---

Fix `signMessage` passing the `UiWalletAccount` handle to the wallet's `solana:signMessage` feature instead of the wallet's own account object. Wallets that compare the input account by reference against their own `WalletAccount` would reject the request.
