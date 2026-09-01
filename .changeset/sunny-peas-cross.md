---
'@solana/kit-plugin-wallet': minor
---

Add `client.wallet.signOffchainMessage` (and the `useSignOffchainMessage` React hook), exposing the wallet-standard `solana:signOffchainMessage` feature. The action signs a Solana offchain message with the connected account and verifies the wallet's response before resolving — decoding the returned bytes, asserting they encode exactly the requested message and signer set, and checking the signature — then resolves with a Kit `OffchainMessageEnvelope`. The input is an object carrying the format `version` (currently always `1`), the `message` text, and an optional `requiredSigners` list for multi-signer messages.
