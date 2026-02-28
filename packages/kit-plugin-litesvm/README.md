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

The LiteSVM plugin starts a new LiteSVM instance within your Kit client, allowing you to simulate Solana programs and accounts locally. Additionally, it derives a small RPC subset that interacts with the LiteSVM instance instead of making network requests.

> [!IMPORTANT]
> This plugin is only available in Node.js builds. Browser and React Native builds throw an error when calling `litesvm()`.

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
- `rpc`: Call a subset of Solana RPC methods against the LiteSVM instance. Currently supported methods are: `getAccountInfo`, `getBalance`, `getEpochSchedule`, `getLatestBlockhash`, `getMinimumBalanceForRentExemption`, `getMultipleAccounts`, `getSlot`, and `requestAirdrop`.
    ```ts
    const { value: latestBlockhash } = await client.rpc.getLatestBlockhash().send();
    ```

## `litesvmTransactionPlanner` plugin

This plugin provides a default transaction planner that creates transaction messages with a fee payer, a provisory compute unit limit, and optional priority fees.

### Installation

This plugin requires a payer to be set on the client or passed as an option.

```ts
import { createEmptyClient } from '@solana/kit';
import { litesvm, litesvmTransactionPlanner, litesvmTransactionPlanExecutor } from '@solana/kit-plugin-litesvm';
import { generatedPayer } from '@solana/kit-plugin-payer';

const client = await createEmptyClient()
    .use(litesvm())
    .use(generatedPayer())
    .use(litesvmTransactionPlanner())
    .use(litesvmTransactionPlanExecutor());
```

### Options

- `payer`: Transaction signer for fees (defaults to client's payer if any).
- `priorityFees`: Priority fees in micro lamports per compute unit.

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
import { createEmptyClient } from '@solana/kit';
import { litesvm, litesvmTransactionPlanner, litesvmTransactionPlanExecutor } from '@solana/kit-plugin-litesvm';
import { generatedPayer } from '@solana/kit-plugin-payer';

const client = await createEmptyClient()
    .use(litesvm())
    .use(generatedPayer())
    .use(litesvmTransactionPlanner())
    .use(litesvmTransactionPlanExecutor());
```

### Features

- `transactionPlanExecutor`: A function that executes planned transactions.
    ```ts
    const transactionPlanResult = await client.transactionPlanExecutor(myTransactionPlan);
    ```
