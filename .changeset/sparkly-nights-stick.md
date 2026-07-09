---
'@solana/kit-plugin-wallet': patch
---

Widen `signMessage` to accept a `ReadonlyUint8Array`

The `signMessage` method on the wallet namespace now accepts a `ReadonlyUint8Array` as well as a `Uint8Array`. The bytes are only read before being passed to the wallet's `solana:signMessage` feature, so callers holding read-only bytes — such as the output of a `@solana/kit` codec — no longer need to cast.
