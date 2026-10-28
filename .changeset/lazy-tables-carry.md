---
'@solana/kit-plugin-wallet': minor
---

Support Sign In With Solana over offchain messages, so hardware wallets can sign in. Pass `useOffchainMessage: { messageVersion: 1 }` to `client.wallet.signIn` and the wallet signs the SIWS text wrapped in a version 1 Solana offchain message. Wallets advertise this with version `1.1.0` (or a later `1.x` version) of `solana:signIn`, which the new `supportsSignInWithOffchainMessage(wallet)` helper checks.

```ts
const output = await client.wallet.signIn(wallet, {
    domain: 'example.com',
    ...(supportsSignInWithOffchainMessage(wallet) && { useOffchainMessage: { messageVersion: 1 } }),
});
```

For a wallet that doesn't support it, `signIn` rejects `useOffchainMessage` with `SOLANA_ERROR__WALLET__FEATURE_VERSION_UNSUPPORTED` before calling the wallet. The wallet's response is checked before it is returned: it must be a version 1 offchain message whose only required signer is the signed-in account, with a valid signature from that account. Otherwise `signIn` rejects with `SOLANA_ERROR__WALLET__INVALID_SIGN_IN_OUTPUT`.
