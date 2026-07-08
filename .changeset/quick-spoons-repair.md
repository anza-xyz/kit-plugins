---
'@solana/kit-plugin-wallet': patch
---

Make the `payer` and `identity` client getters non-enumerable

The dynamic `client.payer` / `client.identity` getters installed by `walletSigner`, `walletPayer`, and `walletIdentity` throw when no signer is connected. They were also enumerable, so any code that enumerates the client and reads its values — an object spread, `Object.entries`, `structuredClone`, or React's dev-mode component-render prop diffing — would invoke them and throw while the client was merely disconnected or still pending. In a React app this surfaced as a hard freeze when the client was rebuilt and briefly published in a disconnected state (for example, switching networks). The getters are now non-enumerable, so enumeration skips them; capability detection via `'payer' in client` and explicit `client.payer` access (which still throws when disconnected, by design) are unchanged.
