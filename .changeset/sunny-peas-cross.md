---
'@solana/kit-plugin-wallet': minor
---

Add `client.wallet.signOffchainMessage` and the `useSignOffchainMessage` React hook, which sign a Solana offchain message with the connected wallet using its `solana:signOffchainMessage` feature.

```ts
const envelope = await client.wallet.signOffchainMessage({
    message: 'Sign in to Example App',
    version: 1,
});
```

The wallet's response is verified before it is returned: the signed bytes must be exactly the message you requested, and the signature must be valid for the connected account. The result is a Kit `OffchainMessageEnvelope`. For messages that need more than one signer, pass every signer's address as `requiredSigners`. The other signers' signatures are left as `null` for you to collect separately.
