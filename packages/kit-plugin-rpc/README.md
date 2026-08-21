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
import { payer } from '@solana/kit-plugin-signer';

const client = createClient()
    .use(payer(myPayer))
    .use(solanaRpc({ rpcUrl: 'https://api.mainnet-beta.solana.com' }));
```

### Options

All options are provided via a `SolanaRpcConfig` object:

- `rpcUrl` **(required)**: URL of the Solana RPC endpoint.
- `rpcSubscriptionsUrl`: URL of the RPC Subscriptions endpoint. Defaults to the `rpcUrl` with the protocol changed from `http` to `ws`. As a convenience, the exact strings `http://127.0.0.1:8899` and `http://localhost:8899` (the canonical local validator RPC endpoints) are rewritten to port `8900`. The match is exact-string only — any other host, scheme, or port (including `https://localhost:8899` or `http://0.0.0.0:8899`) is left untouched. Pass `rpcSubscriptionsUrl` explicitly when your RPC and WebSocket endpoints use different ports.
- `rpcConfig`: Optional configuration forwarded to `createSolanaRpc`.
- `rpcSubscriptionsConfig`: Optional configuration forwarded to `createSolanaRpcSubscriptions`.
- `transactionConfig`: Options to configure how transaction messages are created. See the `rpcTransactionPlanner` options below.
- `maxConcurrency`: Maximum number of concurrent transaction executions. Defaults to 10.
- `skipPreflight`: Whether to always skip preflight simulation. Defaults to `false`.

### Features

- `rpc`: Call any Solana RPC method.
- `rpcSubscriptions`: Subscribe to Solana RPC notifications.
- `getMinimumBalance`: Compute minimum lamports for rent exemption.
- `planTransaction(s)`: Plan instructions into transaction messages without executing them.
- `sendTransaction(s)`: Plan and execute instructions, instruction plans, or transaction messages in one call.
- `transactionPlanner` / `transactionPlanExecutor` (deprecated): Fields kept for backward compatibility. Use `planTransaction(s)` / `sendTransaction(s)` instead.

## `solanaMainnetRpc` plugin

A convenience wrapper around `solanaRpc` that types the connection as a mainnet URL, preventing accidental use of devnet-only features such as airdrops.

### Installation

```ts
import { createClient } from '@solana/kit';
import { solanaMainnetRpc } from '@solana/kit-plugin-rpc';
import { payer } from '@solana/kit-plugin-signer';

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
import { payerFromFile } from '@solana/kit-plugin-signer';

const client = createClient().use(payerFromFile('~/.config/solana/id.json')).use(solanaDevnetRpc());
```

### Features

_See `solanaRpc` for available features, plus:_

- `airdrop`: Request SOL from the devnet faucet.
    ```ts
    await client.airdrop(address('HQVxiMVDoV9jzG4tpoxmDZsNfWvaHXm8DGGv93Gka75v'), lamports(1_000_000_000n));
    ```

## `solanaTestnetRpc` plugin

A convenience wrapper around `solanaRpc` that defaults to the public testnet endpoint (`https://api.testnet.solana.com`) and includes airdrop support for requesting SOL from the faucet.

### Installation

```ts
import { createClient } from '@solana/kit';
import { solanaTestnetRpc } from '@solana/kit-plugin-rpc';
import { payerFromFile } from '@solana/kit-plugin-signer';

const client = createClient().use(payerFromFile('~/.config/solana/id.json')).use(solanaTestnetRpc());
```

### Features

_See `solanaRpc` for available features, plus:_

- `airdrop`: Request SOL from the testnet faucet.
    ```ts
    await client.airdrop(address('HQVxiMVDoV9jzG4tpoxmDZsNfWvaHXm8DGGv93Gka75v'), lamports(1_000_000_000n));
    ```

## `solanaLocalRpc` plugin

A convenience wrapper around `solanaRpc` that defaults to `http://127.0.0.1:8899` for the RPC and `ws://127.0.0.1:8900` for subscriptions, and includes airdrop support.

### Installation

```ts
import { createClient } from '@solana/kit';
import { solanaLocalRpc } from '@solana/kit-plugin-rpc';
import { payerFromFile } from '@solana/kit-plugin-signer';

const client = createClient().use(payerFromFile('~/.config/solana/id.json')).use(solanaLocalRpc());
```

### Features

_See `solanaRpc` for available features, plus:_

- `airdrop`: Request SOL from the local validator faucet.
    ```ts
    await client.airdrop(address('HQVxiMVDoV9jzG4tpoxmDZsNfWvaHXm8DGGv93Gka75v'), lamports(1_000_000_000n));
    ```

## `solanaRpcConnection` plugin

The `solanaRpcConnection` plugin creates a Solana RPC and Solana RPC Subscriptions from a cluster URL and installs both on the client.

### Installation

```ts
import { createClient } from '@solana/kit';
import { solanaRpcConnection } from '@solana/kit-plugin-rpc';

const client = createClient().use(solanaRpcConnection({ rpcUrl: 'https://api.mainnet-beta.solana.com' }));
```

You may wrap your RPC URL using the `mainnet`, `devnet`, or `testnet` helpers from `@solana/kit`. When you do, the returned RPC API will be adjusted to match the selected cluster since some RPC features are not available on all clusters.

```ts
import { mainnet } from '@solana/kit';

const client = createClient().use(solanaRpcConnection({ rpcUrl: mainnet('https://api.mainnet-beta.solana.com') }));
```

### Options

All options are provided via a `SolanaRpcConnectionConfig` object:

- `rpcUrl` **(required)**: URL of the Solana RPC endpoint.
- `rpcSubscriptionsUrl`: URL of the RPC Subscriptions endpoint. Defaults to the `rpcUrl` with the protocol changed from `http` to `ws`. As a convenience, the exact strings `http://127.0.0.1:8899` and `http://localhost:8899` (the canonical local validator RPC endpoints) are rewritten to port `8900`. The match is exact-string only — any other host, scheme, or port (including `https://localhost:8899` or `http://0.0.0.0:8899`) is left untouched. Pass `rpcSubscriptionsUrl` explicitly when your RPC and WebSocket endpoints use different ports.
- `rpcConfig`: Optional configuration forwarded to `createSolanaRpc`.
- `rpcSubscriptionsConfig`: Optional configuration forwarded to `createSolanaRpcSubscriptions`.

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

## `rpcAirdrop` plugin

This plugin adds an `airdrop` method to your Kit client that requests SOL airdrops via the RPC and RPC Subscriptions transports.

> [!NOTE]
> Airdrop is only available on test clusters (devnet, testnet) and local validators. Using this plugin with a mainnet RPC will produce a TypeScript error.

### Installation

The client must have `rpc` and `rpcSubscriptions` installed before applying this plugin.

```ts
import { createClient } from '@solana/kit';
import { solanaRpcConnection, rpcAirdrop } from '@solana/kit-plugin-rpc';

const client = createClient()
    .use(solanaRpcConnection({ rpcUrl: 'http://127.0.0.1:8899' }))
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
    .use(solanaRpcConnection({ rpcUrl: 'https://api.mainnet-beta.solana.com' }))
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

Adds `planTransaction` and `planTransactions` to the client, using a planner that plans instructions into transaction messages with a fee payer, provisory resource limits (a compute unit limit, plus a loaded accounts data size limit for version 1 transactions), and optional priority fees. The fee payer is read from `client.payer` lazily, at plan time, so a dynamic payer (such as a connected wallet) is always respected.

### Usage

The client must have a `payer` set before installing the plugin.

```ts
import { createClient } from '@solana/kit';
import { rpcTransactionPlanSendingExecutor, rpcTransactionPlanner, solanaRpcConnection } from '@solana/kit-plugin-rpc';
import { generatedPayer } from '@solana/kit-plugin-signer';

const client = await createClient()
    .use(solanaRpcConnection({ rpcUrl: 'https://api.mainnet-beta.solana.com' }))
    .use(generatedPayer())
    .use(rpcTransactionPlanner())
    .use(rpcTransactionPlanSendingExecutor());

const transactionPlan = await client.planTransactions(myInstructionPlan);
```

### Options

All options are provided via a `TransactionPlannerConfig` object. Its shape is discriminated by the transaction `version`.

For legacy and version 0 transactions:

- `version`: The transaction message version to use. Accepts `0` or `'legacy'`. Defaults to `0`.
- `microLamportsPerComputeUnit`: The priority fee in micro-lamports per compute unit, added as a `setComputeUnitPrice` instruction. Defaults to no priority fees.
- `estimateResourceLimits`: Whether to estimate and set resource limits by simulating before sending. Set to `false` to skip estimation and reserve no provisory limits, which is useful for transactions close to the message size limit. Defaults to `true`.

For version 1 transactions:

- `version`: Set to `1` to create version 1 transaction messages.
- `priorityFeeLamports`: The total priority fee in lamports, written to the version 1 resource header. Defaults to no priority fees.
- `estimateResourceLimits`: Whether to estimate and set resource limits by simulating before sending. For version 1 transactions, estimation covers both the compute unit limit and the loaded accounts data size limit. Defaults to `true`.

## `rpcTransactionPlanSendingExecutor` plugin

Adds `sendTransaction` and `sendTransactions` to the client, using an executor that estimates resource limits, signs, and sends transactions via RPC. Resource limit estimation covers the compute unit limit and, for version 1 transactions, the loaded accounts data size limit.

### Usage

The client must have `rpc` and `rpcSubscriptions` configured, and a transaction planner installed, before installing this plugin — sending plans through the client's planning functions.

```ts
import { createClient } from '@solana/kit';
import { rpcTransactionPlanSendingExecutor, rpcTransactionPlanner, solanaRpcConnection } from '@solana/kit-plugin-rpc';
import { generatedPayer } from '@solana/kit-plugin-signer';

const client = await createClient()
    .use(solanaRpcConnection({ rpcUrl: 'https://api.mainnet-beta.solana.com' }))
    .use(generatedPayer())
    .use(rpcTransactionPlanner())
    .use(rpcTransactionPlanSendingExecutor());

const transactionPlanResult = await client.sendTransactions(myInstructionPlan);
```

### Options

All options are provided via a `RpcTransactionPlanExecutorConfig` object:

- `estimateResourceLimits`: Whether to estimate and set resource limits by simulating before sending (default: `true`). This should match the `estimateResourceLimits` option on the planner; `solanaRpc` keeps them in sync automatically.
- `getComputeUnitLimitFromEstimate`: A `(estimatedComputeUnits: number) => number` function that maps the estimated compute unit consumption to the compute unit limit to set, adding headroom for variation between simulation and execution. Defaults to a function that adds a buffer on top of the estimate of at least 300 compute units, or a margin that decays linearly from 10% at low estimates to 2% at 500,000 compute units and above, whichever is greater. The result is always capped at 1,400,000 (the per-transaction maximum).
- `maxConcurrency`: Maximum number of concurrent executions (default: 10).
- `skipPreflight`: Whether to skip the preflight simulation when sending transactions (default: `false`).

### Result context

As it works through a transaction, the executor records the planned message (once its blockhash lifetime and resource limits are set), the fully signed transaction, and the signature it was sent under. A successful plan result carries all three on its `context`, and the exported `RpcSendContext` type names that shape so you can annotate results yourself.

```ts
import { SuccessfulSingleTransactionPlanResult } from '@solana/kit';
import { RpcSendContext } from '@solana/kit-plugin-rpc';

function logSentTransaction(result: SuccessfulSingleTransactionPlanResult<RpcSendContext>) {
    console.log(
        `Sent ${result.context.signature} using blockhash ${result.context.message.lifetimeConstraint.blockhash}`,
    );
}
```

Because the context is filled in as execution progresses, a transaction that fails or is canceled part way through carries only what was recorded before it stopped. Failed and canceled results therefore type the context as partial — only successful results guarantee every field.

The `sendTransaction` and `sendTransactions` functions installed by this plugin propagate this context type, so their results carry a typed `RpcSendContext` without any annotation needed.

### Preflight and Resource Limit Estimation

By default, the executor estimates resource limits by simulating the transaction before sending it. This covers the compute unit limit and, for version 1 transactions, the loaded accounts data size limit. When estimation is performed, preflight is skipped to avoid a redundant second simulation. When every applicable resource limit is already explicitly set (no estimation needed), preflight runs as the only simulation.

Setting `skipPreflight: true` changes the behavior:

- Preflight is always skipped regardless of whether estimation was performed.
- If the resource limit estimation simulation fails, the consumed resources from the failed simulation are used to set the limits (with the compute unit buffer from `getComputeUnitLimitFromEstimate` applied) so the transaction still reaches the validator. This is useful for debugging failed transactions in an explorer.

| Scenario            | `skipPreflight: false` (default) | `skipPreflight: true`                  |
| ------------------- | -------------------------------- | -------------------------------------- |
| Estimation succeeds | Set limits, skip preflight       | Set limits, skip preflight             |
| Estimation fails    | Throw                            | Use consumed resources, skip preflight |
| Explicit limits set | Run preflight                    | Skip preflight                         |

Set `estimateResourceLimits: false` to opt out of resource limit estimation entirely. The planner then reserves no provisory resource limits and the executor does not simulate to estimate or inject any; any explicit resource limits already present on the message are preserved. This is useful for transactions close to the message size limit, where adding a compute budget instruction would make an otherwise valid transaction too large.

Note that disabling estimation does not disable preflight. When `estimateResourceLimits: false` and `skipPreflight` is left at its default `false`, the executor still runs a preflight simulation when sending — this becomes the only simulation. To avoid all simulation overhead, set `skipPreflight: true` as well.

When using `solanaRpc`, both the planner and executor read `estimateResourceLimits` from a single place: `transactionConfig`.

```ts
const client = createClient()
    .use(payer(myPayer))
    .use(
        solanaRpc({
            rpcUrl: 'https://api.mainnet-beta.solana.com',
            skipPreflight: true,
            transactionConfig: { estimateResourceLimits: false },
        }),
    );
```

#### Compute unit buffer

Because a transaction can consume slightly more compute units at execution time than during simulation, the executor adds a buffer to the estimated compute unit limit. By default this buffer is the greater of a fixed minimum of 300 compute units and a margin that decays linearly from 10% at low estimates to 2% at 500,000 compute units and above, added on top of the estimate.

Override this by passing a `getComputeUnitLimitFromEstimate` function that maps the raw estimate to the limit to set. It is applied on both successful estimation and the `skipPreflight` recovery path. The resulting limit is always capped at 1,400,000, the maximum number of compute units allowed per transaction, including for custom functions.

```ts
const client = createClient()
    .use(payer(myPayer))
    .use(
        solanaRpc({
            rpcUrl: 'https://api.mainnet-beta.solana.com',
            // Add a flat 20% buffer instead of the default curve.
            getComputeUnitLimitFromEstimate: estimatedComputeUnits => Math.ceil(estimatedComputeUnits * 1.2),
        }),
    );
```

## Deprecated plugins

The following plugins are still exported for backward compatibility but are deprecated. Prefer `solanaRpcConnection` for new code.

- `rpcConnection(rpc)` / `rpcSubscriptionsConnection(rpcSubscriptions)`: Trivial wrappers around `extendClient`. Inline `extendClient({ rpc })` or `extendClient({ rpcSubscriptions })` instead, or use `solanaRpcConnection` when starting from a cluster URL.
- `solanaRpcSubscriptionsConnection(url, config?)`: No longer needed because `solanaRpcConnection` installs both `rpc` and `rpcSubscriptions`.
- `rpcTransactionPlanExecutor(config?)`: Only sets the deprecated `client.transactionPlanExecutor` field. Use `rpcTransactionPlanSendingExecutor` instead, which installs `sendTransaction` and `sendTransactions` alongside the executor.

    ```ts
    // Before
    const client = await createClient()
        .use(rpcTransactionPlanner())
        .use(rpcTransactionPlanExecutor())
        .use(planAndSendTransactions());

    // After
    const client = await createClient().use(rpcTransactionPlanner()).use(rpcTransactionPlanSendingExecutor());
    ```
