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
  import { createClient } from '@solana/kit';
- import { airdrop } from '@solana/kit-plugin-airdrop';
+ import { rpcAirdrop } from '@solana/kit-plugin-rpc';
  import { solanaRpcConnection, solanaRpcSubscriptionsConnection } from '@solana/kit-plugin-rpc';

  const client = createClient()
      .use(solanaRpcConnection('http://127.0.0.1:8899'))
      .use(solanaRpcSubscriptionsConnection('ws://127.0.0.1:8900'))
-     .use(airdrop());
+     .use(rpcAirdrop());
```

### LiteSVM-based airdrop

```diff
  import { createClient } from '@solana/kit';
- import { airdrop } from '@solana/kit-plugin-airdrop';
+ import { litesvmAirdrop } from '@solana/kit-plugin-litesvm';
  import { litesvmConnection } from '@solana/kit-plugin-litesvm';

  const client = createClient()
      .use(litesvmConnection())
-     .use(airdrop());
+     .use(litesvmAirdrop());
```
