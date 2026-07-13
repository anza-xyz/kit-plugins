---
'@solana/kit-plugin-wallet': minor
---

Keep every discovered wallet's account state live by subscribing to wallet-standard `change` events for all discovered wallets, not just the connected one. This is an internal refactor with no public API change: `client.wallet.getState().wallets` now reflects account/feature changes for non-active wallets as they happen.
