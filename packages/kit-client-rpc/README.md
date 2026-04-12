# Kit Plugins ➤ RPC Client (deprecated)

[![npm][npm-image]][npm-url]
[![npm-downloads][npm-downloads-image]][npm-url]

[npm-downloads-image]: https://img.shields.io/npm/dm/@solana/kit-client-rpc.svg?style=flat
[npm-image]: https://img.shields.io/npm/v/@solana/kit-client-rpc.svg?style=flat&label=%40solana%2Fkit-client-rpc
[npm-url]: https://www.npmjs.com/package/@solana/kit-client-rpc

> [!WARNING]
> This package is deprecated. Add a payer to your client using any payer plugin from [`@solana/kit-plugin-payer`](../kit-plugin-payer), then use the all-in-one plugins from [`@solana/kit-plugin-rpc`](../kit-plugin-rpc) instead.
>
> | Deprecated export            | Use instead                                                                     |
> | ---------------------------- | ------------------------------------------------------------------------------- |
> | `createClient({ url, ... })` | `solanaRpc({ rpcUrl, ... })` from [`@solana/kit-plugin-rpc`](../kit-plugin-rpc) |
> | `createLocalClient()`        | `solanaLocalRpc()` from [`@solana/kit-plugin-rpc`](../kit-plugin-rpc)           |

## Migration

```diff
- import { createClient } from '@solana/kit-client-rpc';
+ import { createClient } from '@solana/kit';
+ import { solanaRpc } from '@solana/kit-plugin-rpc';
+ import { payer } from '@solana/kit-plugin-payer';

- const client = createClient({ url: 'https://api.mainnet-beta.solana.com', payer: myPayer });
+ const client = createClient()
+     .use(payer(myPayer))
+     .use(solanaRpc({ rpcUrl: 'https://api.mainnet-beta.solana.com' }));
```
