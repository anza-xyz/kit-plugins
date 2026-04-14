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

## `solanaRpc` plugin

The `solanaRpc` plugin sets up a full Solana RPC client in a single call. It installs an RPC connection, RPC Subscriptions, minimum balance computation, transaction planning, and transaction execution on the client.

The client must have a `payer` set before applying this plugin.

### Installation

```ts
import { createClient } from '@solana/kit';
import { solanaRpc } from '@solana/kit-plugin-rpc';
import { payer } from '@solana/kit-plugin-payer';

const client = createClient()
    .use(payer(myPayer))
    .use(solanaRpc({ rpcUrl: 'https://api.mainnet-beta.solana.com' }));
```

### Options

All options are provided via a `SolanaRpcConfig` object:

- `rpcUrl` **(required)**: URL of the Solana RPC endpoint.
- `rpcSubscriptionsUrl`: URL of the RPC Subscriptions endpoint. Defaults to the `rpcUrl` with the protocol changed from `http` to `ws`.
- `rpcConfig`: Optional configuration forwarded to `createSolanaRpc`.
- `rpcSubscriptionsConfig`: Optional configuration forwarded to `createSolanaRpcSubscriptions`.
- `priorityFees`: Priority fees in micro-lamports per compute unit. Defaults to no priority fees.
- `maxConcurrency`: Maximum number of concurrent transaction executions. Defaults to 10.
- `skipPreflight`: Whether to always skip preflight simulation. Defaults to `false`.

### Features

- `rpc`: Call any Solana RPC method.
- `rpcSubscriptions`: Subscribe to Solana RPC notifications.
- `getMinimumBalance`: Compute minimum lamports for rent exemption.
- `transactionPlanner`: Plan instructions into transaction messages.
- `transactionPlanExecutor`: Sign and send planned transactions.
- `sendTransaction(s)` / `planTransaction(s)`: Convenience helpers that combine planning and execution.

## `solanaMainnetRpc` plugin

A convenience wrapper around `solanaRpc` that types the connection as a mainnet URL, preventing accidental use of devnet-only features such as airdrops.

### Installation

```ts
import { createClient } from '@solana/kit';
import { solanaMainnetRpc } from '@solana/kit-plugin-rpc';
import { payer } from '@solana/kit-plugin-payer';

const client = createClient()
    .use(payer(myPayer))
    .use(solanaMainnetRpc({ rpcUrl: 'https://api.mainnet-beta.solana.com' }));
```

### Features

_See `solanaRpc` for available features._

## `solanaDevnetRpc` plugin

A convenience wrapper around `solanaRpc` that defaults to the public devnet endpoint (`https://api.devnet.solana.com`) and includes airdrop support for requesting SOL from the faucet.

### Installation

```ts
import { createClient } from '@solana/kit';
import { solanaDevnetRpc } from '@solana/kit-plugin-rpc';
import { payerFromFile } from '@solana/kit-plugin-payer';

const client = createClient().use(payerFromFile('~/.config/solana/id.json')).use(solanaDevnetRpc());
```

### Features

_See `solanaRpc` for available features, plus:_

- `airdrop`: Request SOL from the devnet faucet.
    ```ts
    await client.airdrop(address('HQVxiMVDoV9jzG4tpoxmDZsNfWvaHXm8DGGv93Gka75v'), lamports(1_000_000_000n));
    ```

## `solanaLocalRpc` plugin

A convenience wrapper around `solanaRpc` that defaults to `http://127.0.0.1:8899` for the RPC and `ws://127.0.0.1:8900` for subscriptions, and includes airdrop support.

### Installation

```ts
import { createClient } from '@solana/kit';
import { solanaLocalRpc } from '@solana/kit-plugin-rpc';
import { payerFromFile } from '@solana/kit-plugin-payer';

const client = createClient().use(payerFromFile('~/.config/solana/id.json')).use(solanaLocalRpc());
```

### Features

_See `solanaRpc` for available features, plus:_

- `airdrop`: Request SOL from the local validator faucet.
    ```ts
    await client.airdrop(address('HQVxiMVDoV9jzG4tpoxmDZsNfWvaHXm8DGGv93Gka75v'), lamports(1_000_000_000n));
    ```

## `rpcConnection` plugin

The `rpcConnection` plugin sets a provided `Rpc` instance on the client. This is the generic variant that works with any RPC API.

### Installation

```ts
import { createClient, createSolanaRpc } from '@solana/kit';
import { rpcConnection } from '@solana/kit-plugin-rpc';

const myRpc = createSolanaRpc('https://api.mainnet-beta.solana.com');
const client = createClient().use(rpcConnection(myRpc));
```

### Features

- `rpc`: Call any RPC method using type-safe methods.
    ```ts
    const { value: latestBlockhash } = await client.rpc.getLatestBlockhash().send();
    ```

## `rpcSubscriptionsConnection` plugin

The `rpcSubscriptionsConnection` plugin sets a provided `RpcSubscriptions` instance on the client. This is the generic variant that works with any RPC Subscriptions API.

### Installation

```ts
import { createClient, createSolanaRpcSubscriptions } from '@solana/kit';
import { rpcSubscriptionsConnection } from '@solana/kit-plugin-rpc';

const myRpcSubscriptions = createSolanaRpcSubscriptions('wss://api.mainnet-beta.solana.com');
const client = createClient().use(rpcSubscriptionsConnection(myRpcSubscriptions));
```

### Features

- `rpcSubscriptions`: Subscribe to RPC notifications using async iterators.
    ```ts
    const slotNotifications = await client.rpcSubscriptions.slotNotifications({ commitment: 'confirmed' }).subscribe();
    for await (const slotNotification of slotNotifications) {
        console.log('Got a slot notification', slotNotification);
    }
    ```

## `solanaRpcConnection` plugin

The `solanaRpcConnection` plugin creates a Solana RPC from a cluster URL and sets it on the client.

### Installation

```ts
import { createClient } from '@solana/kit';
import { solanaRpcConnection } from '@solana/kit-plugin-rpc';

const client = createClient().use(solanaRpcConnection('https://api.mainnet-beta.solana.com'));
```

You may wrap your RPC URL using the `mainnet`, `devnet`, or `testnet` helpers from `@solana/kit`. When you do, the returned RPC API will be adjusted to match the selected cluster since some RPC features are not available on all clusters.

```ts
import { mainnet } from '@solana/kit';

const client = createClient().use(solanaRpcConnection(mainnet('https://api.mainnet-beta.solana.com')));
```

### Features

- `rpc`: Call any Solana RPC method using type-safe methods.
    ```ts
    const { value: latestBlockhash } = await client.rpc.getLatestBlockhash().send();
    ```

## `solanaRpcSubscriptionsConnection` plugin

The `solanaRpcSubscriptionsConnection` plugin creates Solana RPC Subscriptions from a cluster URL and sets them on the client.

### Installation

```ts
import { createClient } from '@solana/kit';
import { solanaRpcSubscriptionsConnection } from '@solana/kit-plugin-rpc';

const client = createClient().use(solanaRpcSubscriptionsConnection('wss://api.mainnet-beta.solana.com'));
```

### Features

- `rpcSubscriptions`: Subscribe to Solana RPC notifications using async iterators.
    ```ts
    const slotNotifications = await client.rpcSubscriptions.slotNotifications({ commitment: 'confirmed' }).subscribe();
    for await (const slotNotification of slotNotifications) {
        console.log('Got a slot notification', slotNotification);
    }
    ```

## `rpcAirdrop` plugin

This plugin adds an `airdrop` method to your Kit client that requests SOL airdrops via the RPC and RPC Subscriptions transports.

> [!NOTE]
> Airdrop is only available on test clusters (devnet, testnet) and local validators. Using this plugin with a mainnet RPC will produce a TypeScript error.

### Installation

The client must have `rpc` and `rpcSubscriptions` installed before applying this plugin.

```ts
import { createClient } from '@solana/kit';
import { solanaRpcConnection, solanaRpcSubscriptionsConnection, rpcAirdrop } from '@solana/kit-plugin-rpc';

const client = createClient()
    .use(solanaRpcConnection('http://127.0.0.1:8899'))
    .use(solanaRpcSubscriptionsConnection('ws://127.0.0.1:8900'))
    .use(rpcAirdrop());
```

### Features

- `airdrop`: An asynchronous helper function that airdrops a specified amount of lamports to a given address.
    ```ts
    await client.airdrop(address('HQVxiMVDoV9jzG4tpoxmDZsNfWvaHXm8DGGv93Gka75v'), lamports(1_000_000_000n));
    ```

## `rpcGetMinimumBalance` plugin

This plugin adds a `getMinimumBalance` method to your Kit client that computes the minimum lamports required for an account with a given data size, using the `getMinimumBalanceForRentExemption` RPC method.

### Installation

The client must have `rpc` installed before applying this plugin.

```ts
import { createClient } from '@solana/kit';
import { solanaRpcConnection, rpcGetMinimumBalance } from '@solana/kit-plugin-rpc';

const client = createClient()
    .use(solanaRpcConnection('https://api.mainnet-beta.solana.com'))
    .use(rpcGetMinimumBalance());
```

### Features

- `getMinimumBalance`: An asynchronous helper that returns the minimum lamports required for an account with the given data size. By default, the 128-byte account header is included on top of the provided space.

    ```ts
    // Minimum balance for an account with 100 bytes of data (plus header).
    const balance = await client.getMinimumBalance(100);

    // Minimum balance for exactly 100 bytes (without adding the header).
    const rawBalance = await client.getMinimumBalance(100, { withoutHeader: true });
    ```

## `rpcTransactionPlanner` plugin

This plugin provides a default transaction planner that creates transaction messages with a fee payer, a provisory compute unit limit, and optional priority fees.

### Installation

The client must have a `payer` set before applying this plugin.

```ts
import { createClient } from '@solana/kit';
import {
    solanaRpcConnection,
    solanaRpcSubscriptionsConnection,
    rpcTransactionPlanner,
    rpcTransactionPlanExecutor,
} from '@solana/kit-plugin-rpc';
import { generatedPayer } from '@solana/kit-plugin-payer';

const client = await createClient()
    .use(solanaRpcConnection('https://api.mainnet-beta.solana.com'))
    .use(solanaRpcSubscriptionsConnection('wss://api.mainnet-beta.solana.com'))
    .use(generatedPayer())
    .use(rpcTransactionPlanner())
    .use(rpcTransactionPlanExecutor());
```

### Options

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
import { createClient } from '@solana/kit';
import {
    solanaRpcConnection,
    solanaRpcSubscriptionsConnection,
    rpcTransactionPlanner,
    rpcTransactionPlanExecutor,
} from '@solana/kit-plugin-rpc';
import { generatedPayer } from '@solana/kit-plugin-payer';

const client = await createClient()
    .use(solanaRpcConnection('https://api.mainnet-beta.solana.com'))
    .use(solanaRpcSubscriptionsConnection('wss://api.mainnet-beta.solana.com'))
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
