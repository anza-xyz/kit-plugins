---
'@solana/kit-plugin-signer': patch
---

Fix `signerFromFile`, `payerFromFile` and `identityFromFile` not expanding a leading `~` in the keypair path, so the documented `~/.config/solana/id.json` path no longer fails with `ENOENT`.
