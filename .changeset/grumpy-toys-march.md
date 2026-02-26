---
'@solana/kit-client-rpc': minor
'@solana/kit-client-litesvm': minor
'@solana/kit-plugins': patch
---

Split default client factories into dedicated packages: `@solana/kit-client-rpc` (`createDefaultRpcClient`, `createDefaultLocalhostRpcClient`) and `@solana/kit-client-litesvm` (`createDefaultLiteSVMClient`). The umbrella `@solana/kit-plugins` re-exports these with `@deprecated` tags.
