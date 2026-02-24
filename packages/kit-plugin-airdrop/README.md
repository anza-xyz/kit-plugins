# Kit Plugins ➤ Airdrop

[![npm][npm-image]][npm-url]
[![npm-downloads][npm-downloads-image]][npm-url]

[npm-downloads-image]: https://img.shields.io/npm/dm/@solana/kit-plugin-airdrop.svg?style=flat
[npm-image]: https://img.shields.io/npm/v/@solana/kit-plugin-airdrop.svg?style=flat&label=%40solana%2Fkit-plugin-airdrop
[npm-url]: https://www.npmjs.com/package/@solana/kit-plugin-airdrop

This package provides a plugin that adds an `airdrop` helper function to your Kit client.

## Installation

```sh
pnpm install @solana/kit-plugin-airdrop
```

## `airdrop` plugin

The `airdrop` plugin provides an `airdrop` function that allows you to request SOL airdrops to a specified account.

### Installation

In order to use the `airdrop` plugin, the client must be configured with either an RPC plugin or a LiteSVM plugin. You will get a TypeScript error if neither is provided before using the `airdrop` plugin.

#### Using an RPC

```ts
import { createEmptyClient } from '@solana/kit';
import { airdrop, localhostRpc } from '@solana/kit-plugins';

const client = createEmptyClient().use(localhostRpc()).use(airdrop());
```

Note that you will get a TypeScript error when using the `rpc` plugin with a mainnet URL such as `mainnet("https://api.mainnet-beta.solana.com")`, because airdrop RPC methods are not supported on mainnet.

#### Using a LiteSVM instance

```ts
import { createEmptyClient } from '@solana/kit';
import { airdrop, litesvm } from '@solana/kit-plugins';

const client = createEmptyClient().use(litesvm()).use(airdrop());
```

### Features

- `airdrop`: An asynchronous helper function that airdrops a specified amount of lamports to a given address.
    ```ts
    client.airdrop(address('HQVxiMVDoV9jzG4tpoxmDZsNfWvaHXm8DGGv93Gka75v'), lamports(1_000_000_000n));
    ```
