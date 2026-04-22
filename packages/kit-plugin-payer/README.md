# Kit Plugins ➤ Payer (deprecated)

[![npm][npm-image]][npm-url]
[![npm-downloads][npm-downloads-image]][npm-url]

[npm-downloads-image]: https://img.shields.io/npm/dm/@solana/kit-plugin-payer.svg?style=flat
[npm-image]: https://img.shields.io/npm/v/@solana/kit-plugin-payer.svg?style=flat&label=%40solana%2Fkit-plugin-payer
[npm-url]: https://www.npmjs.com/package/@solana/kit-plugin-payer

> [!WARNING]
> This package is deprecated. Use [`@solana/kit-plugin-signer`](../kit-plugin-signer) instead, which provides the same payer plugins plus new `identity` and `signer` variants.

## Migration

All exports are available under the same name in `@solana/kit-plugin-signer`. Simply update your import path:

```diff
  import { createClient } from '@solana/kit';
- import { payer } from '@solana/kit-plugin-payer';
+ import { payer } from '@solana/kit-plugin-signer';

  const client = createClient().use(payer(mySigner));
```

The full mapping is:

| `@solana/kit-plugin-payer` | `@solana/kit-plugin-signer`                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| `payer()`                  | `payer()` (also available: `identity()`, `signer()`)                                                 |
| `generatedPayer()`         | `generatedPayer()` (also available: `generatedIdentity()`, `generatedSigner()`)                      |
| `generatedPayerWithSol()`  | `generatedPayerWithSol()` (also available: `generatedIdentityWithSol()`, `generatedSignerWithSol()`) |
| `payerFromFile()`          | `payerFromFile()` (also available: `identityFromFile()`, `signerFromFile()`)                         |
| `payerOrGeneratedPayer()`  | Use `payer()` and/or `generatedPayerWithSol()` directly                                              |

### `payerOrGeneratedPayer` migration

`payerOrGeneratedPayer` has no direct replacement. Use `payer()` for the explicit case and `generatedPayerWithSol()` for the generated case:

```diff
  import { createClient, lamports } from '@solana/kit';
  import { solanaRpcConnection, rpcAirdrop } from '@solana/kit-plugin-rpc';
- import { payerOrGeneratedPayer } from '@solana/kit-plugin-payer';
+ import { payer, generatedPayerWithSol } from '@solana/kit-plugin-signer';

  // With an explicit payer.
- const client = await createClient().use(payerOrGeneratedPayer(mySigner));
+ const client = createClient().use(payer(mySigner));

  // With a generated payer funded with SOL.
  const client = await createClient()
      .use(solanaRpcConnection({ rpcUrl: 'http://127.0.0.1:8899' }))
      .use(rpcAirdrop())
-     .use(payerOrGeneratedPayer(undefined));
+     .use(generatedPayerWithSol(lamports(100_000_000_000n)));
```
