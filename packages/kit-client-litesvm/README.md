# Kit Plugins ➤ LiteSVM Client (deprecated)

[![npm][npm-image]][npm-url]
[![npm-downloads][npm-downloads-image]][npm-url]

[npm-downloads-image]: https://img.shields.io/npm/dm/@solana/kit-client-litesvm.svg?style=flat
[npm-image]: https://img.shields.io/npm/v/@solana/kit-client-litesvm.svg?style=flat&label=%40solana%2Fkit-client-litesvm
[npm-url]: https://www.npmjs.com/package/@solana/kit-client-litesvm

> [!WARNING]
> This package is deprecated. Add a payer to your client using any payer plugin from [`@solana/kit-plugin-payer`](../kit-plugin-payer), then use the `litesvm` all-in-one plugin from [`@solana/kit-plugin-litesvm`](../kit-plugin-litesvm) instead.
>
> | Deprecated export | Use instead                                                            |
> | ----------------- | ---------------------------------------------------------------------- |
> | `createClient()`  | `litesvm()` from [`@solana/kit-plugin-litesvm`](../kit-plugin-litesvm) |

## Migration

```diff
- import { createClient } from '@solana/kit-client-litesvm';
+ import { createClient } from '@solana/kit';
+ import { litesvm } from '@solana/kit-plugin-litesvm';
+ import { payer } from '@solana/kit-plugin-payer';

- const client = await createClient({ payer: myPayer });
+ const client = createClient().use(payer(myPayer)).use(litesvm());
```
