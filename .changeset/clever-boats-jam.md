---
'@solana/kit-plugin-signer': minor
'@solana/kit-plugin-wallet': minor
---

Add `ClientWithSubscribeToPayer` and `ClientWithSubscribeToIdentity` to `@solana/kit-plugin-signer`. These are a framework-agnostic convention for plugins that mutate `client.payer` / `client.identity` reactively — they install a sibling `subscribeToPayer` / `subscribeToIdentity` function so consumers can observe changes without naming the specific plugin.
