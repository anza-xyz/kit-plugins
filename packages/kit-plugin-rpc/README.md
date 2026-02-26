# Kit Plugins ➤ RPC

[![npm][npm-image]][npm-url]
[![npm-downloads][npm-downloads-image]][npm-url]

[npm-downloads-image]: https://img.shields.io/npm/dm/@solana/kit-plugin-rpc.svg?style=flat
[npm-image]: https://img.shields.io/npm/v/@solana/kit-plugin-rpc.svg?style=flat&label=%40solana%2Fkit-plugin-rpc
[npm-url]: https://www.npmjs.com/package/@solana/kit-plugin-rpc

This package provides plugins that add RPC functionality to your Kit clients.

## Installation

```sh
pnpm install @solana/kit-plugin-rpc
```

## `rpc` plugin

The RPC plugin adds `rpc` and `rpcSubscriptions` objects to your Kit client, allowing you to call RPC methods and subscribe to RPC notifications.

### Installation

To use the `rpc` plugin, you must provide the URL of your desired Solana RPC endpoint.

```ts
import { createEmptyClient } from '@solana/kit';
import { rpc } from '@solana/kit-plugins';

const client = createEmptyClient().use(rpc('https://api.mainnet-beta.solana.com'));
```

Note that you may wrap your RPC URL using the `mainnet`, `devnet`, or `testnet` helpers from `@solana/kit`. When you do, the returned RPC API will be adjusted to match the selected cluster since some RPC features are not available on all clusters.

```ts
import { mainnet } from '@solana/kit';

const client = createEmptyClient().use(rpc(mainnet('https://api.mainnet-beta.solana.com')));
```

By default, the WebSocket URL is derived from the RPC's HTTP URL but you may configure it explicitly using the second parameter. This config object can also be used to customize other aspects of RPC Subscriptions behavior.

```ts
const client = createEmptyClient().use(
    rpc('https://my-rpc-url.com', {
        url: 'wss://my-rpc-ws-url.com',
        minChannels: 5,
        maxSubscriptionsPerChannel: 50,
    }),
);
```

### Features

- `rpc`: Call any Solana RPC method using type-safe methods.
    ```ts
    const { value: latestBlockhash } = await client.rpc.getLatestBlockhash().send();
    ```
- `rpcSubscriptions`: Subscribe to Solana RPC notifications using async iterators.
    ```ts
    const slotNotifications = await client.rpcSubscriptions.slotNotifications({ commitment: 'confirmed' }).subscribe();
    for await (const slotNotification of slotNotifications) {
        console.log('Got a slot notification', slotNotification);
    }
    ```

## `localhostRpc` plugin

This plugin is an alias for the `rpc` plugin pre-configured to connect to a local Solana validator.

### Installation

```ts
import { createEmptyClient } from '@solana/kit';
import { localhostRpc } from '@solana/kit-plugins';

const client = createEmptyClient().use(localhostRpc());
```

### Features

_See the `rpc` plugin for available features_.
