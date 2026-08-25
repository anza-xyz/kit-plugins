# Kit Plugins ➤ Instruction Plan

[![npm][npm-image]][npm-url]
[![npm-downloads][npm-downloads-image]][npm-url]

[npm-downloads-image]: https://img.shields.io/npm/dm/@solana/kit-plugin-instruction-plan.svg?style=flat
[npm-image]: https://img.shields.io/npm/v/@solana/kit-plugin-instruction-plan.svg?style=flat&label=%40solana%2Fkit-plugin-instruction-plan
[npm-url]: https://www.npmjs.com/package/@solana/kit-plugin-instruction-plan

This package provides plugins that add transaction planning, signing and execution to your Kit clients.

## Installation

```sh
pnpm install @solana/kit-plugin-instruction-plan
```

## Quick start

```ts
import { createClient } from '@solana/kit';
import { transactionPlanner, transactionPlanSendingExecutor } from '@solana/kit-plugin-instruction-plan';

const client = createClient()
    .use(transactionPlanner(myTransactionPlanner))
    .use(transactionPlanSendingExecutor(myTransactionPlanExecutor));

// Plan without executing.
const transactionPlan = await client.planTransactions(myInstructionPlan);

// Plan and execute in one call.
const result = await client.sendTransactions(myInstructionPlan);
```

## `transactionPlanner` plugin

The `transactionPlanner` plugin adds `planTransaction` and `planTransactions` to the client, using the provided transaction planner.

### Installation

```ts
import { createClient, createTransactionPlanner } from '@solana/kit';
import { transactionPlanner } from '@solana/kit-plugin-instruction-plan';

const myTransactionPlanner = createTransactionPlanner(/* ... */);
const client = createClient().use(transactionPlanner(myTransactionPlanner));
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

For backward compatibility this plugin also sets a `client.transactionPlanner` field, but that field is deprecated in favour of the two functions above.

## `transactionPlanSendingExecutor` plugin

The `transactionPlanSendingExecutor` plugin adds `sendTransaction` and `sendTransactions` to the client, using the client's planning functions and the provided transaction plan executor. Both functions accept transaction messages, instructions, instruction plans or transaction plans as input, planning the input first when it is not already a transaction plan.

Planning goes through the client's `planTransaction` and `planTransactions` functions, so the `transactionPlanner` plugin must be installed first — otherwise the plugin throws when applied. Note that installing another `transactionPlanner` afterwards does not affect sending: `sendTransaction` and `sendTransactions` keep using the planning functions that were on the client when they were installed.

### Installation

```ts
import { createClient } from '@solana/kit';
import { transactionPlanner, transactionPlanSendingExecutor } from '@solana/kit-plugin-instruction-plan';

const client = createClient()
    .use(transactionPlanner(myTransactionPlanner))
    .use(transactionPlanSendingExecutor(myTransactionPlanExecutor));
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

For backward compatibility this plugin also sets a `client.transactionPlanExecutor` field, but that field is deprecated in favour of the two functions above.

## `transactionPlanSigningExecutor` plugin

The `transactionPlanSigningExecutor` plugin adds `signTransaction` and `signTransactions` to the client, using the client's planning functions and a transaction plan executor that signs transactions without sending them. Both functions accept transaction messages, instructions, instruction plans or transaction plans as input, planning the input first when it is not already a transaction plan.

Planning goes through the client's `planTransaction` and `planTransactions` functions, so the `transactionPlanner` plugin must be installed first. The result context is inferred from the executor, allowing signing implementations to expose their signed transactions or other signing-specific data.

### Installation

```ts
import { createClient } from '@solana/kit';
import { transactionPlanner, transactionPlanSigningExecutor } from '@solana/kit-plugin-instruction-plan';

const client = createClient()
    .use(transactionPlanner(myTransactionPlanner))
    .use(transactionPlanSigningExecutor(myTransactionPlanSigningExecutor));
```

### Features

- `signTransactions`: Plans and signs transaction messages, instructions or instruction plans without sending them.

    ```ts
    const transactionPlanResult = await client.signTransactions(myInstructionPlan);
    ```

- `signTransaction`: Same as `signTransactions` but asserts that the result is successful and contains a single transaction. Should the provided input result in multiple transactions, an error will be thrown.

    ```ts
    const transactionPlanResult = await client.signTransaction(myInstructionPlan);
    ```

## Deprecated plugins

The following plugins are still exported for backward compatibility but are deprecated.

- **`transactionPlanExecutor(executor)`**: Only sets the deprecated `client.transactionPlanExecutor` field. Use `transactionPlanSendingExecutor` instead, which installs `sendTransaction` and `sendTransactions` alongside the executor.
- **`planAndSendTransactions()`**: No longer needed. `transactionPlanner` now installs `planTransaction` and `planTransactions`, and `transactionPlanSendingExecutor` installs `sendTransaction` and `sendTransactions`.

```ts
// Before
const client = createClient()
    .use(transactionPlanner(myTransactionPlanner))
    .use(transactionPlanExecutor(myTransactionPlanExecutor))
    .use(planAndSendTransactions());

// After
const client = createClient()
    .use(transactionPlanner(myTransactionPlanner))
    .use(transactionPlanSendingExecutor(myTransactionPlanExecutor));
```

## Default Planner and Executor Implementations

For ready-to-use transaction planner and executor implementations, see:

- [`@solana/kit-plugin-rpc`](https://www.npmjs.com/package/@solana/kit-plugin-rpc) — provides the `rpcTransactionPlanner` and `rpcTransactionPlanSendingExecutor` plugins for RPC-based transaction planning and execution.
- [`@solana/kit-plugin-litesvm`](https://www.npmjs.com/package/@solana/kit-plugin-litesvm) — provides the `litesvmTransactionPlanner` and `litesvmTransactionPlanSendingExecutor` plugins for LiteSVM-based transaction planning and execution.
