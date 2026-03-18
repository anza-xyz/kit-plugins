---
'@solana/kit-plugin-airdrop': minor
'@solana/kit-plugin-instruction-plan': minor
'@solana/kit-plugin-litesvm': minor
'@solana/kit-plugin-payer': minor
'@solana/kit-plugin-rpc': minor
---

Use `extendClient` from `@solana/kit` instead of object spread to build client objects in plugins, preserving property descriptors and ensuring immutability.
