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

## `litesvm` plugin

The `litesvm` plugin sets up a full LiteSVM client in a single call. It installs an SVM connection, airdrop support, minimum balance computation, transaction planning, and transaction execution on the client.

The client must have a `payer` set before applying this plugin.

> [!IMPORTANT]
> This plugin is only available in Node.js builds. Browser and React Native builds throw an error when calling `litesvm()`.

### Installation

```ts
import { createClient } from '@solana/kit';
import { litesvm } from '@solana/kit-plugin-litesvm';
import { payer } from '@solana/kit-plugin-payer';

const client = createClient().use(payer(myPayer)).use(litesvm());
```

### Options

All options are provided via a `LiteSvmConfig` object:

- `transactionConfig`: Options to configure how transaction messages are created. See `litesvmTransactionPlanner` options below.

### Features

- `svm`: Access the underlying LiteSVM instance.
- `rpc`: Call a subset of Solana RPC methods against the LiteSVM instance.
- `airdrop`: Request SOL from the LiteSVM faucet.
- `getMinimumBalance`: Compute minimum lamports for rent exemption.
- `transactionPlanner`: Plan instructions into transaction messages.
- `transactionPlanExecutor`: Sign and send planned transactions.
- `sendTransaction(s)` / `planTransaction(s)`: Convenience helpers that combine planning and execution.

## `litesvmConnection` plugin

The LiteSVM plugin starts a new LiteSVM instance within your Kit client, allowing you to simulate Solana programs and accounts locally. Additionally, it derives a small RPC subset that interacts with the LiteSVM instance instead of making network requests.

> [!IMPORTANT]
> This plugin is only available in Node.js builds. Browser and React Native builds throw an error when calling `litesvmConnection()`.

### Installation

```ts
import { createClient } from '@solana/kit';
import { litesvmConnection } from '@solana/kit-plugin-litesvm';

const client = createClient().use(litesvmConnection());
```

### Features

- `svm`: Access the underlying LiteSVM instance.
    ```ts
    client.svm.setAccount(myAccount);
    client.svm.addProgramFromFile(myProgramAddress, 'my_program.so');
    ```
- `rpc`: Call a subset of Solana RPC methods against the LiteSVM instance. Currently supported methods are: `getAccountInfo`, `getBalance`, `getEpochSchedule`, `getLatestBlockhash`, `getMinimumBalanceForRentExemption`, `getMultipleAccounts`, `getSlot`, and `requestAirdrop`.
    ```ts
    const { value: latestBlockhash } = await client.rpc.getLatestBlockhash().send();
    ```

## `litesvmAirdrop` plugin

This plugin adds an `airdrop` method to your Kit client that airdrops SOL using the underlying LiteSVM instance. It performs error handling and returns the transaction signature on success.

### Installation

The client must have the `litesvmConnection` plugin installed before applying this plugin.

```ts
import { createClient } from '@solana/kit';
import { litesvmConnection, litesvmAirdrop } from '@solana/kit-plugin-litesvm';

const client = createClient().use(litesvmConnection()).use(litesvmAirdrop());
```

### Features

- `airdrop`: An asynchronous helper function that airdrops a specified amount of lamports to a given address.
    ```ts
    await client.airdrop(address('HQVxiMVDoV9jzG4tpoxmDZsNfWvaHXm8DGGv93Gka75v'), lamports(1_000_000_000n));
    ```

## `litesvmGetMinimumBalance` plugin

This plugin adds a `getMinimumBalance` method to your Kit client that computes the minimum lamports required for an account with a given data size, using the underlying LiteSVM instance.

### Installation

The client must have the `litesvmConnection` plugin installed before applying this plugin.

```ts
import { createClient } from '@solana/kit';
import { litesvmConnection, litesvmGetMinimumBalance } from '@solana/kit-plugin-litesvm';

const client = createClient().use(litesvmConnection()).use(litesvmGetMinimumBalance());
```

### Features

- `getMinimumBalance`: An asynchronous helper that returns the minimum lamports required for an account with the given data size. By default, the 128-byte account header is included on top of the provided space.

    ```ts
    // Minimum balance for an account with 100 bytes of data (plus header).
    const balance = await client.getMinimumBalance(100);

    // Minimum balance for exactly 100 bytes (without adding the header).
    const rawBalance = await client.getMinimumBalance(100, { withoutHeader: true });
    ```

## `litesvmTransactionPlanner` plugin

This plugin provides a default transaction planner that creates transaction messages with a fee payer and optional priority fees.

### Installation

The client must have a `payer` set before applying this plugin.

```ts
import { createClient } from '@solana/kit';
import {
    litesvmConnection,
    litesvmTransactionPlanner,
    litesvmTransactionPlanExecutor,
} from '@solana/kit-plugin-litesvm';
import { generatedPayer } from '@solana/kit-plugin-payer';

const client = await createClient()
    .use(litesvmConnection())
    .use(generatedPayer())
    .use(litesvmTransactionPlanner())
    .use(litesvmTransactionPlanExecutor());
```

### Options

All options are provided via a `TransactionPlannerConfig` object:

- `version`: The transaction message version to use. Accepts `0` or `'legacy'`. Defaults to `0`.
- `microLamportsPerComputeUnit`: Priority fees in micro lamports per compute unit. Defaults to no priority fees.

### Features

- `transactionPlanner`: A function that plans instructions into transaction messages.
    ```ts
    const transactionPlan = await client.transactionPlanner(myInstructionPlan);
    ```

## `litesvmTransactionPlanExecutor` plugin

This plugin provides a default transaction plan executor that signs and sends transactions to the LiteSVM instance.

### Installation

This plugin requires an `svm` instance to be configured on the client.

```ts
import { createClient } from '@solana/kit';
import {
    litesvmConnection,
    litesvmTransactionPlanner,
    litesvmTransactionPlanExecutor,
} from '@solana/kit-plugin-litesvm';
import { generatedPayer } from '@solana/kit-plugin-payer';

const client = await createClient()
    .use(litesvmConnection())
    .use(generatedPayer())
    .use(litesvmTransactionPlanner())
    .use(litesvmTransactionPlanExecutor());
```

### Features

- `transactionPlanExecutor`: A function that executes planned transactions.
    ```ts
    const transactionPlanResult = await client.transactionPlanExecutor(myTransactionPlan);
    ```
