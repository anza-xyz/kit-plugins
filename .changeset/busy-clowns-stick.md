---
'@solana/kit-plugin-wallet': minor
---

Add `walletSigner`, `walletIdentity`, `walletPayer`, and `walletWithoutSigner` plugins for framework-agnostic wallet management using wallet-standard. Provides wallet discovery, connection lifecycle, signer creation, auto-connect persistence, subscribable state for UI frameworks, and dynamic payer/identity integration. Variants that install `client.payer` or `client.identity` also install companion `subscribeToPayer` / `subscribeToIdentity` subscribe hooks so reactive consumers (e.g. `@solana/kit-react`'s `usePayer` / `useIdentity`) can re-render on change without naming the wallet plugin directly.
