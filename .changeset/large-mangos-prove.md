---
'@solana/kit-plugin-signer': minor
---

Add a `createIfMissing` option to `signerFromFile`, `payerFromFile` and `identityFromFile`. When enabled, a new keypair is generated and saved to the given path if no file exists there yet. Defaults to `false`.
