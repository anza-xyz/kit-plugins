---
'@solana/kit-plugin-wallet': minor
---

Drop wallet accounts whose `publicKey` doesn't match their `address`, and expose copies of the verified accounts so a wallet can't change them later. The wallets and accounts exposed by the plugin are no longer the same objects returned by `@wallet-standard/ui-registry`, but they still work with its helpers. `signIn` also rejects a sign-in output whose account has a different `publicKey` than the account the wallet exposes for that address, and returns the verified account in place of the wallet's own.
