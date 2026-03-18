# Kit Plugins ➤ Airdrop (deprecated)

[![npm][npm-image]][npm-url]
[![npm-downloads][npm-downloads-image]][npm-url]

[npm-downloads-image]: https://img.shields.io/npm/dm/@solana/kit-plugin-airdrop.svg?style=flat
[npm-image]: https://img.shields.io/npm/v/@solana/kit-plugin-airdrop.svg?style=flat&label=%40solana%2Fkit-plugin-airdrop
[npm-url]: https://www.npmjs.com/package/@solana/kit-plugin-airdrop

> [!WARNING]
> This package is deprecated. Use `rpcAirdrop` from [`@solana/kit-plugin-rpc`](../kit-plugin-rpc) or `litesvmAirdrop` from [`@solana/kit-plugin-litesvm`](../kit-plugin-litesvm) instead.

## Migration

### RPC-based airdrop

```diff
  import { createEmptyClient } from '@solana/kit';
- import { airdrop, localhostRpc } from '@solana/kit-plugins';
+ import { localhostRpc, rpcAirdrop } from '@solana/kit-plugins';

  const client = createEmptyClient()
      .use(localhostRpc())
-     .use(airdrop());
+     .use(rpcAirdrop());
```

### LiteSVM-based airdrop

```diff
  import { createEmptyClient } from '@solana/kit';
- import { airdrop, litesvm } from '@solana/kit-plugins';
+ import { litesvm, litesvmAirdrop } from '@solana/kit-plugins';

  const client = createEmptyClient()
      .use(litesvm())
-     .use(airdrop());
+     .use(litesvmAirdrop());
```
