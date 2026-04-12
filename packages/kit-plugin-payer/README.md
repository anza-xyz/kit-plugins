# Kit Plugins ➤ Payer

[![npm][npm-image]][npm-url]
[![npm-downloads][npm-downloads-image]][npm-url]

[npm-downloads-image]: https://img.shields.io/npm/dm/@solana/kit-plugin-payer.svg?style=flat
[npm-image]: https://img.shields.io/npm/v/@solana/kit-plugin-payer.svg?style=flat&label=%40solana%2Fkit-plugin-payer
[npm-url]: https://www.npmjs.com/package/@solana/kit-plugin-payer

This package offers plugins that set up the main "payer" signer on your Kit clients. It does this by adding a `payer` property to the client, which can then be used to sign transactions, pay for fees, etc. This is a good way to feed signer information to subsequent plugins.

## Installation

```sh
pnpm install @solana/kit-plugin-payer
```

## `payer` plugin

This plugin simply accepts a `TransactionSigner` and sets it as the `payer` property on the client.

### Installation

```ts
import { createClient } from '@solana/kit';
import { payer } from '@solana/kit-plugin-payer';

const client = createClient().use(payer(mySigner));
```

### Features

- `payer`: The main payer signer for your Kit client.
    ```ts
    console.log(client.payer.address);
    const transactionMessage = pipe(
        createTransactionMessage({ version: 0 }),
        tx => setTransactionFeePayerSigner(client.payer, tx),
        tx => appendTransactionMessageInstruction(getTransferSolInstruction({ source: client.payer, ... }), tx),
    );
    ```

## `generatedPayer` plugin

This asynchronous plugin generates a new random `KeyPairSigner` to be used as the `payer` property on the client.

### Installation

```ts
import { createClient } from '@solana/kit';
import { generatedPayer } from '@solana/kit-plugin-payer';

const client = await createClient().use(generatedPayer());
```

### Features

_See the `payer` plugin for available features_.

## `generatedPayerWithSol` plugin

This asynchronous plugin generates a new random `KeyPairSigner`, airdrops some SOL to it and sets it as the `payer` property on the client.

### Installation

Note that this plugin requires an airdrop plugin to be installed on the client beforehand (e.g. `rpcAirdrop` or `litesvmAirdrop`) which itself either requires an RPC connection or a LiteSVM instance.

```ts
import { createClient } from '@solana/kit';
import { solanaRpcConnection, solanaRpcSubscriptionsConnection, rpcAirdrop } from '@solana/kit-plugin-rpc';
import { generatedPayerWithSol } from '@solana/kit-plugin-payer';

const client = await createClient()
    .use(solanaRpcConnection('http://127.0.0.1:8899'))
    .use(solanaRpcSubscriptionsConnection('ws://127.0.0.1:8900'))
    .use(rpcAirdrop())
    // or .use(litesvmConnection()).use(litesvmAirdrop())
    .use(generatedPayerWithSol(lamports(10_000_000_000n))); // 10 SOL
```

### Features

_See the `payer` plugin for available features_.

## `payerOrGeneratedPayer` plugin

This asynchronous plugin uses the provided `TransactionSigner` as the payer if one is given. Otherwise, it generates a new random `KeyPairSigner`, airdrops 100 SOL to it, and sets it as the `payer` property on the client. This is useful when you want to optionally accept a payer from the caller but fall back to a generated and funded payer for convenience (e.g. in testing or local development).

### Installation

When no explicit payer is given, this plugin requires an airdrop plugin to be installed on the client beforehand (e.g. `rpcAirdrop` or `litesvmAirdrop`) which itself either requires an RPC connection or a LiteSVM instance.

```ts
import { createClient } from '@solana/kit';
import { solanaRpcConnection, solanaRpcSubscriptionsConnection, rpcAirdrop } from '@solana/kit-plugin-rpc';
import { payerOrGeneratedPayer } from '@solana/kit-plugin-payer';

// With an explicit payer — no airdrop needed.
const client = await createClient().use(payerOrGeneratedPayer(mySigner));

// Without a payer — generates one and airdrops 100 SOL.
const client = await createClient()
    .use(solanaRpcConnection('http://127.0.0.1:8899'))
    .use(solanaRpcSubscriptionsConnection('ws://127.0.0.1:8900'))
    .use(rpcAirdrop())
    // or .use(litesvmConnection()).use(litesvmAirdrop())
    .use(payerOrGeneratedPayer(undefined));
```

### Features

_See the `payer` plugin for available features_.

## `payerFromFile` plugin

This plugin loads a `KeyPairSigner` from a local file and sets it as the `payer` property on the client.

### Installation

Note that this plugin requires access to the local filesystem and therefore can only work in Node.js environments. Other environments (like browsers) will throw an error when trying to use this plugin.

```ts
import { createClient } from '@solana/kit';
import { payerFromFile } from '@solana/kit-plugin-payer';

const client = createClient().use(payerFromFile('path/to/keypair.json'));
```

### Features

_See the `payer` plugin for available features_.
