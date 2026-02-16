---
'@solana/kit-plugin-airdrop': minor
'@solana/kit-plugin-payer': minor
'@solana/kit-plugins': minor
---

Replace the `AirdropFunction` type with the `ClientWithAirdrop` interface from `@solana/kit`. The airdrop plugin now returns `ClientWithAirdrop & T` instead of `T & { airdrop: AirdropFunction }`, and the payer plugin uses `ClientWithAirdrop` directly from `@solana/kit` instead of importing `AirdropFunction` from `@solana/kit-plugin-airdrop`.

**BREAKING CHANGES**

**`AirdropFunction` type removed from `@solana/kit-plugin-airdrop`.** Use `ClientWithAirdrop` from `@solana/kit` instead.

```diff
- import type { AirdropFunction } from '@solana/kit-plugin-airdrop';
+ import type { ClientWithAirdrop } from '@solana/kit';
```
