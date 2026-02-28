# Kit Plugins ➤ RPC

[![npm][npm-image]][npm-url]
[![npm-downloads][npm-downloads-image]][npm-url]

[npm-downloads-image]: https://img.shields.io/npm/dm/@solana/kit-plugin-rpc.svg?style=flat
[npm-image]: https://img.shields.io/npm/v/@solana/kit-plugin-rpc.svg?style=flat&label=%40solana%2Fkit-plugin-rpc
[npm-url]: https://www.npmjs.com/package/@solana/kit-plugin-rpc

This package provides plugins that add RPC functionality to your Kit clients.

## Installation

```sh
pnpm install @solana/kit-plugin-rpc
```

## `rpc` plugin

The RPC plugin adds `rpc` and `rpcSubscriptions` objects to your Kit client, allowing you to call RPC methods and subscribe to RPC notifications.

### Installation

To use the `rpc` plugin, you must provide the URL of your desired Solana RPC endpoint.

```ts
import { createEmptyClient } from '@solana/kit';
import { rpc } from '@solana/kit-plugins';

const client = createEmptyClient().use(rpc('https://api.mainnet-beta.solana.com'));
```

Note that you may wrap your RPC URL using the `mainnet`, `devnet`, or `testnet` helpers from `@solana/kit`. When you do, the returned RPC API will be adjusted to match the selected cluster since some RPC features are not available on all clusters.

```ts
import { mainnet } from '@solana/kit';

const client = createEmptyClient().use(rpc(mainnet('https://api.mainnet-beta.solana.com')));
```

By default, the WebSocket URL is derived from the RPC's HTTP URL but you may configure it explicitly using the second parameter. This config object can also be used to customize other aspects of RPC Subscriptions behavior.

```ts
const client = createEmptyClient().use(
    rpc('https://my-rpc-url.com', {
        url: 'wss://my-rpc-ws-url.com',
        minChannels: 5,
        maxSubscriptionsPerChannel: 50,
    }),
);
```

### Features

- `rpc`: Call any Solana RPC method using type-safe methods.
    ```ts
    const { value: latestBlockhash } = await client.rpc.getLatestBlockhash().send();
    ```
- `rpcSubscriptions`: Subscribe to Solana RPC notifications using async iterators.
    ```ts
    const slotNotifications = await client.rpcSubscriptions.slotNotifications({ commitment: 'confirmed' }).subscribe();
    for await (const slotNotification of slotNotifications) {
        console.log('Got a slot notification', slotNotification);
    }
    ```

## `localhostRpc` plugin

This plugin is an alias for the `rpc` plugin pre-configured to connect to a local Solana validator.

### Installation

```ts
import { createEmptyClient } from '@solana/kit';
import { localhostRpc } from '@solana/kit-plugins';

const client = createEmptyClient().use(localhostRpc());
```

### Features

_See the `rpc` plugin for available features_.

## `rpcAirdrop` plugin

This plugin adds an `airdrop` method to your Kit client that requests SOL airdrops via the RPC and RPC Subscriptions transports.

> [!NOTE]
> Airdrop is only available on test clusters (devnet, testnet) and local validators. Using this plugin with a mainnet RPC will produce a TypeScript error.

### Installation

The client must have `rpc` and `rpcSubscriptions` installed before applying this plugin.

```ts
import { createEmptyClient } from '@solana/kit';
import { localhostRpc, rpcAirdrop } from '@solana/kit-plugin-rpc';

const client = createEmptyClient().use(localhostRpc()).use(rpcAirdrop());
```

### Features

- `airdrop`: An asynchronous helper function that airdrops a specified amount of lamports to a given address.
    ```ts
    await client.airdrop(address('HQVxiMVDoV9jzG4tpoxmDZsNfWvaHXm8DGGv93Gka75v'), lamports(1_000_000_000n));
    ```

## `rpcTransactionPlanner` plugin

This plugin provides a default transaction planner that creates transaction messages with a fee payer, a provisory compute unit limit, and optional priority fees.

### Installation

This plugin requires a payer to be set on the client or passed as an option.

```ts
import { createEmptyClient } from '@solana/kit';
import { rpc, rpcTransactionPlanner, rpcTransactionPlanExecutor } from '@solana/kit-plugin-rpc';
import { generatedPayer } from '@solana/kit-plugin-payer';

const client = await createEmptyClient()
    .use(rpc('https://api.mainnet-beta.solana.com'))
    .use(generatedPayer())
    .use(rpcTransactionPlanner())
    .use(rpcTransactionPlanExecutor());
```

### Options

- `payer`: Transaction signer for fees (defaults to client's payer if any).
- `priorityFees`: Priority fees in micro lamports per compute unit.

### Features

- `transactionPlanner`: A function that plans instructions into transaction messages.
    ```ts
    const transactionPlan = await client.transactionPlanner(myInstructionPlan);
    ```

## `rpcTransactionPlanExecutor` plugin

This plugin provides a default transaction plan executor that estimates compute units, signs, and sends transactions via RPC.

### Installation

This plugin requires `rpc` and `rpcSubscriptions` to be configured on the client.

```ts
import { createEmptyClient } from '@solana/kit';
import { rpc, rpcTransactionPlanner, rpcTransactionPlanExecutor } from '@solana/kit-plugin-rpc';
import { generatedPayer } from '@solana/kit-plugin-payer';

const client = await createEmptyClient()
    .use(rpc('https://api.mainnet-beta.solana.com'))
    .use(generatedPayer())
    .use(rpcTransactionPlanner())
    .use(rpcTransactionPlanExecutor());
```

### Options

- `maxConcurrency`: Maximum number of concurrent executions (default: 10).
- `skipPreflight`: Whether to skip the preflight simulation when sending transactions (default: `false`).

### Features

- `transactionPlanExecutor`: A function that executes planned transactions.
    ```ts
    const transactionPlanResult = await client.transactionPlanExecutor(myTransactionPlan);
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
