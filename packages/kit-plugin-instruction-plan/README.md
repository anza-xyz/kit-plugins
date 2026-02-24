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

## `sendTransactions` plugin

The `sendTransactions` plugin adds two helper functions, `sendTransaction` and `sendTransactions`, that combine transaction planning and execution in a single call. They accept transaction messages, instructions or instruction plans as input.

### Installation

This plugin requires both `transactionPlanner` and `transactionPlanExecutor` to be installed on the client.

```ts
import { createEmptyClient } from '@solana/kit';
import { transactionPlanner, transactionPlanExecutor, sendTransactions } from '@solana/kit-plugins';

const client = createEmptyClient()
    .use(transactionPlanner(myTransactionPlanner))
    .use(transactionPlanExecutor(myTransactionPlanExecutor))
    .use(sendTransactions());
```

### Features

- `sendTransactions`: An asynchronous function that plans and executes transaction messages, instructions or instruction plans in one call.

    ```ts
    const transactionPlanResult = await client.sendTransactions(myInstructionPlan);
    ```

- `sendTransaction`: An asynchronous function that plans and executes a single transaction message, instruction plan or multiple instructions in one call. Should the provided instructions or instruction plan result in multiple transactions, an error will be thrown prior to execution.

    ```ts
    const transactionPlanResult = await client.sendTransaction(myInstructionPlan);
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
- `skipPreflight`: Whether to skip the preflight simulation when sending transactions (default: `false`).

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

### Preflight and Compute Unit Estimation

By default, the executor estimates compute units by simulating the transaction before sending it. When estimation is performed, preflight is skipped to avoid a redundant second simulation. When the transaction has an explicit compute unit limit (no estimation needed), preflight runs as the only simulation.

Setting `skipPreflight: true` changes the behavior:

- Preflight is always skipped regardless of whether estimation was performed.
- If the compute unit estimation simulation fails, the consumed units from the failed simulation are used to set the compute unit limit (with a 10% buffer) so the transaction still reaches the validator. This is useful for debugging failed transactions in an explorer.

| Scenario            | `skipPreflight: false` (default) | `skipPreflight: true`           |
| ------------------- | -------------------------------- | ------------------------------- |
| Estimation succeeds | Set CU, skip preflight           | Set CU, skip preflight          |
| Estimation fails    | Throw                            | Use consumed CU, skip preflight |
| Explicit CU limit   | Run preflight                    | Skip preflight                  |

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
