# Kit Plugins ➤ Instruction Plan

[![npm][npm-image]][npm-url]
[![npm-downloads][npm-downloads-image]][npm-url]

[npm-downloads-image]: https://img.shields.io/npm/dm/@solana/kit-plugin-instruction-plan.svg?style=flat
[npm-image]: https://img.shields.io/npm/v/@solana/kit-plugin-instruction-plan.svg?style=flat&label=%40solana%2Fkit-plugin-instruction-plan
[npm-url]: https://www.npmjs.com/package/@solana/kit-plugin-instruction-plan

This package provides plugins that add transaction planning and execution to your Kit clients.

## Installation

```sh
pnpm install @solana/kit-plugin-instruction-plan
```

## `transactionPlanner` plugin

The `transactionPlanner` plugin sets a custom transaction planner on the client.

### Installation

```ts
import { createEmptyClient, createTransactionPlanner } from '@solana/kit';
import { transactionPlanner } from '@solana/kit-plugins';

const myTransactionPlanner = createTransactionPlanner(/* ... */);
const client = createEmptyClient().use(transactionPlanner(myTransactionPlanner));
```

### Features

- `transactionPlanner`: A function that plans instructions into transaction messages.
    ```ts
    const transactionPlan = await client.transactionPlanner(myInstructionPlan);
    ```

## `transactionPlanExecutor` plugin

The `transactionPlanExecutor` plugin sets a custom transaction plan executor on the client.

### Installation

```ts
import { createEmptyClient, createTransactionPlanExecutor } from '@solana/kit';
import { transactionPlanExecutor } from '@solana/kit-plugins';

const myTransactionPlanExecutor = createTransactionPlanExecutor(/* ... */);
const client = createEmptyClient().use(transactionPlanExecutor(myTransactionPlanExecutor));
```

### Features

- `transactionPlanExecutor`: A function that executes planned transactions.
    ```ts
    const transactionPlanResult = await client.transactionPlanExecutor(myTransactionPlan);
    ```

## `planAndSendTransactions` plugin

The `planAndSendTransactions` plugin adds helper functions for planning and sending transactions. They accept transaction messages, instructions or instruction plans as input.

### Installation

This plugin requires both `transactionPlanner` and `transactionPlanExecutor` to be installed on the client.

```ts
import { createEmptyClient } from '@solana/kit';
import { transactionPlanner, transactionPlanExecutor, planAndSendTransactions } from '@solana/kit-plugins';

const client = createEmptyClient()
    .use(transactionPlanner(myTransactionPlanner))
    .use(transactionPlanExecutor(myTransactionPlanExecutor))
    .use(planAndSendTransactions());
```

### Features

- `planTransactions`: Plans transaction messages, instructions or instruction plans into a transaction plan without executing it.

    ```ts
    const transactionPlan = await client.planTransactions(myInstructionPlan);
    ```

- `planTransaction`: Same as `planTransactions` but asserts that the result contains a single transaction message.

    ```ts
    const transactionMessage = await client.planTransaction(myInstructionPlan);
    ```

- `sendTransactions`: Plans and executes transaction messages, instructions or instruction plans in one call.

    ```ts
    const transactionPlanResult = await client.sendTransactions(myInstructionPlan);
    ```

- `sendTransaction`: Same as `sendTransactions` but asserts that the result is successful and contains a single transaction. Should the provided input result in multiple transactions, an error will be thrown.

    ```ts
    const transactionPlanResult = await client.sendTransaction(myInstructionPlan);
    ```

## Default Planner and Executor Implementations

For ready-to-use transaction planner and executor implementations, see:

- [`@solana/kit-plugin-rpc`](https://www.npmjs.com/package/@solana/kit-plugin-rpc) — provides `rpcTransactionPlanner` and `rpcTransactionPlanExecutor` for RPC-based transaction planning and execution.
- [`@solana/kit-plugin-litesvm`](https://www.npmjs.com/package/@solana/kit-plugin-litesvm) — provides `litesvmTransactionPlanner` and `litesvmTransactionPlanExecutor` for LiteSVM-based transaction planning and execution.
