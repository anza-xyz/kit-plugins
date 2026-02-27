# Kit Plugins

[![npm][npm-image]][npm-url]
[![npm-downloads][npm-downloads-image]][npm-url]
[![ci][ci-image]][ci-url]

[npm-downloads-image]: https://img.shields.io/npm/dm/@solana/kit-plugins.svg?style=flat
[npm-image]: https://img.shields.io/npm/v/@solana/kit-plugins.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@solana/kit-plugins
[ci-image]: https://img.shields.io/github/actions/workflow/status/anza-xyz/kit-plugins/main.yml?logo=GitHub
[ci-url]: https://github.com/anza-xyz/kit-plugins/actions/workflows/main.yml

A plugin library for [Solana Kit](https://github.com/anza-xyz/kit) that provides **ready-to-use clients** for your Solana applications!

## Features

- ✨ **Ready-to-use clients** for production, local development, and local testing.
- ✨ **Modular plugin system** to build custom clients by combining individual plugins.
- ✨ Default **transaction planning and execution** logic built-in, just call `client.sendTransaction(myInstructions)`.
- ✨ Various **useful plugins** for RPC connectivity, payer management, SOL airdrops, LiteSVM support and more.

## Quick Start

Choose from the following three ready-to-use clients!

### Production (Mainnet/Devnet/Testnet)

Pre-configured client for production use with real Solana clusters.

```sh
pnpm install @solana/kit @solana/kit-client-rpc
```

```ts
import { generateKeyPairSigner } from '@solana/kit';
import { createClient } from '@solana/kit-client-rpc';

const payer = await generateKeyPairSigner();
const client = createClient({ payer, url: 'https://api.devnet.solana.com' });

// Send transactions
await client.sendTransaction([myInstruction]);
```

[See all features and configuration options](./packages/kit-client-rpc/README.md#createclient).

### Local Development

Pre-configured client for localhost development with automatic payer funding.

```sh
pnpm install @solana/kit @solana/kit-client-rpc
```

```ts
import { createLocalClient } from '@solana/kit-client-rpc';
import { lamports } from '@solana/kit';

const client = await createLocalClient();

// Payer is auto-generated and funded with SOL
console.log('Payer address:', client.payer.address);
await client.sendTransaction([myInstruction]);
```

[See all features and configuration options](./packages/kit-client-rpc/README.md#createlocalclient).

### Local Testing with LiteSVM

Pre-configured client using LiteSVM for testing without an RPC connection.

```sh
pnpm install @solana/kit @solana/kit-client-litesvm
```

```ts
import { createClient } from '@solana/kit-client-litesvm';

const client = await createClient();

// Set up test environment
client.svm.setAccount(myTestAccount);
client.svm.addProgramFromFile(myProgramAddress, 'program.so');

// Execute transactions locally
await client.sendTransaction([myInstruction]);
```

[See all features and configuration options](./packages/kit-client-litesvm/README.md#createclient).

## Build Your Own Client

None of the ready-to-use clients fit your needs? No worries! You can **build your own custom clients** by combining individual plugins like so.

```ts
import { createEmptyClient } from '@solana/kit';
import { rpc } from '@solana/kit-plugin-rpc';
import { payerFromFile } from '@solana/kit-plugin-payer';
import { airdrop } from '@solana/kit-plugin-airdrop';
import { rpcTransactionPlanner, rpcTransactionPlanExecutor } from '@solana/kit-plugin-rpc';
import { planAndSendTransactions } from '@solana/kit-plugin-instruction-plan';

const client = await createEmptyClient() // An empty client with a `use` method to install plugins.
    .use(rpc('https://api.devnet.solana.com')) // Adds `client.rpc` and `client.rpcSubscriptions`.
    .use(payerFromFile('path/to/keypair.json')) // Adds `client.payer` using a local keypair file.
    .use(airdrop()) // Adds `client.airdrop` to request SOL from faucets.
    .use(rpcTransactionPlanner()) // Adds `client.transactionPlanner`.
    .use(rpcTransactionPlanExecutor()) // Adds `client.transactionPlanExecutor`.
    .use(planAndSendTransactions()); // Adds `client.planTransaction(s)` and `client.sendTransaction(s)`.
```

Note that since plugins are defined in `@solana/kit` itself, you're not limited to the plugins in this repo! You can use [community plugins](#community-plugins) or even [create your own](#create-your-own-plugins).

## Available Clients

| Package                                                       | Description                   | Exports                             |
| ------------------------------------------------------------- | ----------------------------- | ----------------------------------- |
| [`@solana/kit-client-rpc`](./packages/kit-client-rpc)         | Pre-configured RPC client     | `createClient`, `createLocalClient` |
| [`@solana/kit-client-litesvm`](./packages/kit-client-litesvm) | Pre-configured LiteSVM client | `createClient`                      |

## Community Clients

_Do you know any? Please open a PR to add them here!_

## Available Plugins

This repo provides the following individual plugin packages. You can learn more about each package by following the links to their READMEs below.

| Package                                                                         | Description                        | Plugins                                                                      |
| ------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------- |
| [`@solana/kit-plugin-rpc`](./packages/kit-plugin-rpc)                           | Connect to Solana clusters         | `rpc`, `localhostRpc`, `rpcTransactionPlanner`, `rpcTransactionPlanExecutor` |
| [`@solana/kit-plugin-payer`](./packages/kit-plugin-payer)                       | Manage transaction fee payers      | `payer`, `payerFromFile`, `generatedPayer`, `generatedPayerWithSol`          |
| [`@solana/kit-plugin-airdrop`](./packages/kit-plugin-airdrop)                   | Request SOL from faucets           | `airdrop`                                                                    |
| [`@solana/kit-plugin-litesvm`](./packages/kit-plugin-litesvm)                   | LiteSVM support                    | `litesvm`, `litesvmTransactionPlanner`, `litesvmTransactionPlanExecutor`     |
| [`@solana/kit-plugin-instruction-plan`](./packages/kit-plugin-instruction-plan) | Transaction planning and execution | `transactionPlanner`, `transactionPlanExecutor`, `planAndSendTransactions`   |

## Community Plugins

| Package                                                                                                             | Description                                                             | Plugins                           | Maintainers                        |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------- | ---------------------------------- |
| [`airdrop-token`](https://github.com/amilz/kit-helpers/tree/main/plugins/airdrop-token) _(unpublished)_             | Create token mints, ATAs, and mint tokens for testing                   | `airdropToken`, `testTokenPlugin` | [@amilz](https://github.com/amilz) |
| [`local-validator`](https://github.com/amilz/kit-helpers/tree/main/plugins/local-validator) _(unpublished)_         | Solana test validator lifecycle management (start, stop, restart)       | `localValidatorPlugin`            | [@amilz](https://github.com/amilz) |
| [`transaction-builder`](https://github.com/amilz/kit-helpers/tree/main/plugins/transaction-builder) _(unpublished)_ | Transaction builder for constructing, signing, and sending transactions | `transactionBuilderPlugin`        | [@amilz](https://github.com/amilz) |

_Do you know any? Please open a PR to add them here!_

## Create Your Own Plugins

A plugin is defined in `@solana/kit` as a function that takes a client object and returns a new one (or a promise that resolves to a new one).

```ts
export type ClientPlugin<TInput extends object, TOutput extends Promise<object> | object> = (input: TInput) => TOutput;
```

This means you can create plugins that extend clients like so:

```ts
function apple() {
    return <T extends object>(client: T) => ({ ...client, fruit: 'apple' as const });
}
```

You may also add requirements to your plugins to ensure that other plugins have been installed beforehand. For instance, in the example below, the `appleTart` plugin requires that the `apple` plugin has already been installed on the client.

```ts
function appleTart() {
    return <T extends { fruit: 'apple' }>(client: T) => ({ ...client, dessert: 'appleTart' as const });
}

createEmptyClient().use(apple()).use(appleTart()); // Ok
createEmptyClient().use(appleTart()); // TypeScript error
```

Plugins can also be asynchronous if required and return promises that resolve to clients.

```ts
function magicFruit() {
    return async <T extends object>(client: T) => {
        const fruit = await fetchSomeMagicFruit();
        return { ...client, fruit };
    };
}
```

The `use` function on the client takes care of awaiting asynchronous plugins automatically, so you can use them seamlessly alongside synchronous ones and simply await the final client when required.

```ts
const client = await createEmptyClient().use(magicFruit()).use(apple());
```
