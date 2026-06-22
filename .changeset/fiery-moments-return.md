---
'@solana/kit-plugin-instruction-plan': patch
'@solana/kit-client-litesvm': patch
'@solana/kit-plugin-litesvm': patch
'@solana/kit-plugin-airdrop': patch
'@solana/kit-plugin-signer': patch
'@solana/kit-client-rpc': patch
'@solana/kit-plugin-payer': patch
'@solana/kit-plugin-rpc': patch
'@solana/kit-plugins': patch
---

Require `@solana/kit@^6.10.0`. The `@solana/kit` peer dependency range is raised from `^6.8.0` to `^6.10.0` to match `@solana/kit-plugin-wallet` and the version resolved across the workspace. This also corrects a latent incompatibility: `@solana/kit-plugin-payer` and `@solana/kit-plugin-rpc` import APIs (`ExtendedClient`, `estimateResourceLimitsFactory`) that were only introduced in `@solana/kit@6.10.0`, so the previous `^6.8.0` range understated their true requirement.
