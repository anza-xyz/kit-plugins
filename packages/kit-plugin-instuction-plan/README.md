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

> [!NOTE]
> This package is included in the main [`@solana/kit-plugins`](../kit-plugins) package.
>
> ```sh
> pnpm install @solana/kit-plugins
> ```

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

## `sendInstructionPlans` plugin

The `sendInstructionPlans` plugin adds a `send` function that combines transaction planning and execution in a single call.

### Installation

This plugin requires both `transactionPlanner` and `transactionPlanExecutor` to be installed on the client.

```ts
import { createEmptyClient } from '@solana/kit';
import { transactionPlanner, transactionPlanExecutor, sendInstructionPlans } from '@solana/kit-plugins';

const client = createEmptyClient()
    .use(transactionPlanner(myTransactionPlanner))
    .use(transactionPlanExecutor(myTransactionPlanExecutor))
    .use(sendInstructionPlans());
```

### Features

- `send`: An asynchronous function that plans and executes instruction plans in one call.
    ```ts
    const transactionPlanResult = await client.send(myInstructionPlan);
    ```

## `defaultTransactionPlannerAndExecutorFromRpc` plugin

This plugin provides default transaction planner and executor implementations using RPC and RPC Subscriptions.

### Installation

This plugin requires the `rpc` and `rpcSubscriptions` attributes to be configured on the client.

It also requires a payer to be set on the client or passed as an option to the plugin.

```ts
import { createEmptyClient } from '@solana/kit';
import { rpc, generatedPayer, defaultTransactionPlannerAndExecutorFromRpc } from '@solana/kit-plugins';

const client = await createEmptyClient()
    .use(rpc('https://api.mainnet-beta.solana.com'))
    .use(generatedPayer())
    .use(defaultTransactionPlannerAndExecutorFromRpc());
```

### Options

- `maxConcurrency`: Maximum number of concurrent executions (default: 10).
- `payer`: Transaction signer for fees (defaults to client's payer if any).
- `priorityFees`: Priority fees in micro lamports per compute unit.

```ts
const client = await createEmptyClient()
    .use(rpc('https://api.mainnet-beta.solana.com'))
    .use(
        defaultTransactionPlannerAndExecutorFromRpc({
            maxConcurrency: 5,
            payer: myPayer,
            priorityFees: microLamports(1000n),
        }),
    );
```

### Features

_See the `transactionPlanner` and `transactionPlanExecutor` plugins for available features_.

## `defaultTransactionPlannerAndExecutorFromLitesvm` plugin

This plugin provides default transaction planner and executor implementations using LiteSVM.

### Installation

This plugin requires a LiteSVM instance to be configured on the client.

It also requires a payer to be set on the client or passed as an option to the plugin.

```ts
import { createEmptyClient } from '@solana/kit';
import { litesvm, generatedPayer, defaultTransactionPlannerAndExecutorFromLitesvm } from '@solana/kit-plugins';

const client = await createEmptyClient()
    .use(litesvm())
    .use(generatedPayer())
    .use(defaultTransactionPlannerAndExecutorFromLitesvm());
```

### Options

- `payer`: Transaction signer for fees (defaults to client's payer if any).
- `priorityFees`: Priority fees in micro lamports per compute unit.

```ts
const client = await createEmptyClient()
    .use(litesvm())
    .use(
        defaultTransactionPlannerAndExecutorFromLitesvm({
            payer: myPayer,
            priorityFees: microLamports(1000n),
        }),
    );
```

### Features

_See the `transactionPlanner` and `transactionPlanExecutor` plugins for available features_.
