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
import { createClient, createTransactionPlanner } from '@solana/kit';
import { transactionPlanner } from '@solana/kit-plugin-instruction-plan';

const myTransactionPlanner = createTransactionPlanner(/* ... */);
const client = createClient().use(transactionPlanner(myTransactionPlanner));
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
import { createClient, createTransactionPlanExecutor } from '@solana/kit';
import { transactionPlanExecutor } from '@solana/kit-plugin-instruction-plan';

const myTransactionPlanExecutor = createTransactionPlanExecutor(/* ... */);
const client = createClient().use(transactionPlanExecutor(myTransactionPlanExecutor));
```

### Features

- `transactionPlanExecutor`: A function that executes planned transactions.
    ```ts
    const transactionPlanResult = await client.transactionPlanExecutor(myTransactionPlan);
    ```

## `planAndSendTransactions` plugin

> **Deprecated:** use the [`transactionPlanning`](#transactionplanning-plugin) and [`transactionSending`](#transactionsending-plugin) plugins instead. They take the planner and executor explicitly instead of reading them off the client, so signing and sending can use different executors.

The `planAndSendTransactions` plugin adds helper functions for planning and sending transactions. They accept transaction messages, instructions or instruction plans as input.

### Installation

This plugin requires both `transactionPlanner` and `transactionPlanExecutor` to be installed on the client.

```ts
import { createClient } from '@solana/kit';
import {
    transactionPlanner,
    transactionPlanExecutor,
    planAndSendTransactions,
} from '@solana/kit-plugin-instruction-plan';

const client = createClient()
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

## `transactionPlanning` plugin

The `transactionPlanning` plugin adds helper functions for planning transactions without executing them. Unlike `planAndSendTransactions`, the planner is passed explicitly to the plugin rather than read off the client, and this plugin installs only the planning functions — pair it with [`transactionSigning`](#transactionsigning-plugin) and/or [`transactionSending`](#transactionsending-plugin) for the capabilities that execute the plan.

### Installation

```ts
import { createClient } from '@solana/kit';
import { transactionPlanning } from '@solana/kit-plugin-instruction-plan';

const client = createClient().use(transactionPlanning({ transactionPlanner: myTransactionPlanner }));
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

## `transactionSigning` plugin

The `transactionSigning` plugin adds helper functions that plan and then sign transactions, without sending them. A planner is required because signing plans before it can sign, but this plugin installs only the signing functions — pair it with [`transactionPlanning`](#transactionplanning-plugin) for `planTransaction`/`planTransactions`, and with [`transactionSending`](#transactionsending-plugin) to also send the result.

### Installation

```ts
import { createClient } from '@solana/kit';
import { transactionSigning } from '@solana/kit-plugin-instruction-plan';

const client = createClient().use(
    transactionSigning({
        transactionPlanner: myTransactionPlanner,
        transactionSigningExecutor: myTransactionSigningExecutor,
    }),
);
```

### Features

- `signTransactions`: Plans and signs transaction messages, instructions or instruction plans without sending them. The result carries the signed transactions so they can be sent later, elsewhere, or handed off to another client.

    ```ts
    const transactionPlanResult = await client.signTransactions(myInstructionPlan);
    ```

- `signTransaction`: Same as `signTransactions` but asserts that the result is successful and contains a single transaction. Should the provided input result in multiple transactions, an error will be thrown.

    ```ts
    const transactionPlanResult = await client.signTransaction(myInstructionPlan);
    ```

## `transactionSending` plugin

The `transactionSending` plugin adds helper functions that plan and then send transactions in a single call. A planner is required because sending plans before it can send, but this plugin installs only the sending functions — pair it with [`transactionPlanning`](#transactionplanning-plugin) for `planTransaction`/`planTransactions`, and with [`transactionSigning`](#transactionsigning-plugin) to sign without sending.

### Installation

```ts
import { createClient } from '@solana/kit';
import { transactionSending } from '@solana/kit-plugin-instruction-plan';

const client = createClient().use(
    transactionSending({
        transactionPlanner: myTransactionPlanner,
        transactionSendingExecutor: myTransactionSendingExecutor,
    }),
);
```

### Features

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
