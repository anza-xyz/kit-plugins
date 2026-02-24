---
'@solana/kit-client-rpc': minor
'@solana/kit-client-litesvm': minor
'@solana/kit-plugins': patch
---

Simplify client factory names to leverage package namespacing: `createDefaultRpcClient` → `createClient`, `createDefaultLocalhostRpcClient` → `createLocalClient` in `@solana/kit-client-rpc`, and `createDefaultLiteSVMClient` → `createClient` in `@solana/kit-client-litesvm`. The umbrella `@solana/kit-plugins` continues to re-export the old names as deprecated aliases.
