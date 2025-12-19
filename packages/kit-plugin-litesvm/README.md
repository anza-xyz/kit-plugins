# Kit Plugins ➤ LiteSVM

[![npm][npm-image]][npm-url]
[![npm-downloads][npm-downloads-image]][npm-url]

[npm-downloads-image]: https://img.shields.io/npm/dm/@solana/kit-plugin-litesvm.svg?style=flat
[npm-image]: https://img.shields.io/npm/v/@solana/kit-plugin-litesvm.svg?style=flat&label=%40solana%2Fkit-plugin-litesvm
[npm-url]: https://www.npmjs.com/package/@solana/kit-plugin-litesvm

This package provides a plugin that adds LiteSVM functionality to your Kit clients.

## Installation

```sh
pnpm install @solana/kit-plugin-litesvm
```

> [!NOTE]
> This package is included in the main [`@solana/kit-plugins`](../kit-plugins) package.
>
> ```sh
> pnpm install @solana/kit-plugins
> ```

## `litesvm` plugin

The LiteSVM plugin starts a new LiteSVM instance within your Kit client, allowing you to simulate Solana programs and accounts locally. Additionally, it derives a small RPC subset that interacts with the LiteSVM instance instead of making network requests.

### Installation

```ts
import { createEmptyClient } from '@solana/kit';
import { litesvm } from '@solana/kit-plugins';

const client = createEmptyClient().use(litesvm());
```

### Features

- `svm`: Access the underlying LiteSVM instance.
    ```ts
    client.svm.setAccount(myAccount);
    client.svm.addProgramFromFile(myProgramAddress, 'my_program.so');
    ```
- `rpc`: Call a subset of Solana RPC methods against the LiteSVM instance. Currently supported methods are: `getAccountInfo`, `getMultipleAccounts`, and `getLatestBlockhash`.
    ```ts
    const { value: latestBlockhash } = await client.rpc.getLatestBlockhash().send();
    ```
