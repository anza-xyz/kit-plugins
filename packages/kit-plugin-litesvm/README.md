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
import { payer } from '@solana/kit-plugin-signer';

const client = createClient().use(payer(myPayer)).use(litesvm());
```

### Options

All options are provided via a `LiteSvmConfig` object:

- `transactionConfig`: Options to configure how transaction messages are created. See the `litesvmTransactionPlanner` options below.

### Features

- `svm`: Access the underlying LiteSVM instance.
- `rpc`: Call a subset of Solana RPC methods against the LiteSVM instance.
- `airdrop`: Request SOL from the LiteSVM faucet.
- `getMinimumBalance`: Compute minimum lamports for rent exemption.
- `planTransaction(s)`: Plan instructions into transaction messages without executing them.
- `sendTransaction(s)`: Plan and execute instructions, instruction plans, or transaction messages in one call.
- `transactionPlanner` / `transactionPlanExecutor` (deprecated): Fields kept for backward compatibility. Use `planTransaction(s)` / `sendTransaction(s)` instead.

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
- `rpc`: Call a subset of Solana RPC methods against the LiteSVM instance. Currently supported methods are: `getAccountInfo`, `getBalance`, `getEpochSchedule`, `getLatestBlockhash`, `getMinimumBalanceForRentExemption`, `getMultipleAccounts`, `getProgramAccounts`, `getSlot`, and `requestAirdrop`.
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

Adds `planTransaction` and `planTransactions` to the client, using a planner that plans instructions into transaction messages with a fee payer and optional priority fees. The fee payer is read from `client.payer` lazily, at plan time, so a dynamic payer (such as a connected wallet) is always respected.

### Usage

The client must have a `payer` set before installing the plugin.

```ts
import { createClient } from '@solana/kit';
import {
    litesvmConnection,
    litesvmTransactionPlanSendingExecutor,
    litesvmTransactionPlanner,
} from '@solana/kit-plugin-litesvm';
import { generatedPayer } from '@solana/kit-plugin-signer';

const client = await createClient()
    .use(litesvmConnection())
    .use(generatedPayer())
    .use(litesvmTransactionPlanner())
    .use(litesvmTransactionPlanSendingExecutor());

const transactionPlan = await client.planTransactions(myInstructionPlan);
```

### Options

All options are provided via a `TransactionPlannerConfig` object. Its shape is discriminated by the transaction `version`.

For legacy and version 0 transactions:

- `version`: The transaction message version to use. Accepts `0` or `'legacy'`. Defaults to `0`.
- `microLamportsPerComputeUnit`: The priority fee in micro-lamports per compute unit, added as a `setComputeUnitPrice` instruction. Defaults to no priority fees.

Unlike the RPC planner, the LiteSVM planner does not estimate resource limits, since LiteSVM executes transactions locally without a simulation-based estimation step.

For version 1 transactions:

- `version`: Set to `1` to create version 1 transaction messages.
- `priorityFeeLamports`: The total priority fee in lamports, written to the version 1 resource header. Defaults to no priority fees.

## `litesvmTransactionPlanSendingExecutor` plugin

Adds `sendTransaction` and `sendTransactions` to the client, using an executor that signs and sends transactions to the LiteSVM instance. When a transaction fails, it throws a `SolanaError` with the same error codes the RPC executor would produce. The executor stores the LiteSVM transaction metadata (`FailedTransactionMetadata` or `TransactionMetadata`) on `context.transactionMetadata`, so consumers can inspect logs, compute units consumed, and return data from the plan result.

### Usage

The client must have an `svm` instance configured, and a transaction planner installed, before installing this plugin — sending plans through the client's planning functions.

```ts
import { createClient } from '@solana/kit';
import {
    litesvmConnection,
    litesvmTransactionPlanSendingExecutor,
    litesvmTransactionPlanner,
} from '@solana/kit-plugin-litesvm';
import { generatedPayer } from '@solana/kit-plugin-signer';

const client = await createClient()
    .use(litesvmConnection())
    .use(generatedPayer())
    .use(litesvmTransactionPlanner())
    .use(litesvmTransactionPlanSendingExecutor());

const transactionPlanResult = await client.sendTransactions(myInstructionPlan);
```

### Result context

As it works through a transaction, the executor records the planned message (once its blockhash lifetime is set), the fully signed transaction, the signature it was sent under, and the LiteSVM metadata the send produced. A successful plan result carries all four on its `context`, and the exported `LiteSvmSendContext` type names that shape so you can annotate results yourself.

```ts
import { SuccessfulSingleTransactionPlanResult } from '@solana/kit';
import { isFailedTransaction, LiteSvmSendContext } from '@solana/kit-plugin-litesvm';

function logComputeUnits(result: SuccessfulSingleTransactionPlanResult<LiteSvmSendContext>) {
    const { signature, transactionMetadata } = result.context;
    if (!isFailedTransaction(transactionMetadata)) {
        console.log(`${signature} consumed ${transactionMetadata.computeUnitsConsumed()} compute units`);
    }
}
```

Because the context is filled in as execution progresses, a transaction that fails or is canceled part way through carries only what was recorded before it stopped. Failed and canceled results therefore type the context as partial — only successful results guarantee every field.

The `sendTransaction` and `sendTransactions` functions installed by this plugin propagate this context type, so their results carry a typed `LiteSvmSendContext` without any annotation needed.

## Deprecated plugins

The following plugins are still exported for backward compatibility but are deprecated.

- `litesvmTransactionPlanExecutor()`: Only sets the deprecated `client.transactionPlanExecutor` field. Use `litesvmTransactionPlanSendingExecutor` instead, which installs `sendTransaction` and `sendTransactions` alongside the executor.

    ```ts
    // Before
    const client = await createClient()
        .use(litesvmTransactionPlanner())
        .use(litesvmTransactionPlanExecutor())
        .use(planAndSendTransactions());

    // After
    const client = await createClient().use(litesvmTransactionPlanner()).use(litesvmTransactionPlanSendingExecutor());
    ```
