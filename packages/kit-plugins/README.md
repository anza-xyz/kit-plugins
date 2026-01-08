# Kit Plugins ➤ Main Library

[![npm][npm-image]][npm-url]
[![npm-downloads][npm-downloads-image]][npm-url]

[npm-downloads-image]: https://img.shields.io/npm/dm/@solana/kit-plugins.svg?style=flat
[npm-image]: https://img.shields.io/npm/v/@solana/kit-plugins.svg?style=flat&label=%40solana%2Fkit-plugins
[npm-url]: https://www.npmjs.com/package/@solana/kit-plugins

Essential plugins and plugin presets for Solana Kit that provide RPC connectivity, payer management, transaction execution, test environments and more. Choose from three ready-to-use client configurations or build your own.

## Installation

```sh
pnpm install @solana/kit-plugins
```

## Default Clients

This package provides three plugin presets that create ready-to-use Kit clients for different use cases: production, localhost development, and local blockchain simulation.

### `createDefaultRpcClient`

Pre-configured client for production use with real Solana clusters.

```ts
import { createDefaultRpcClient } from '@solana/kit-plugins';
import { generateKeyPairSigner } from '@solana/kit';

const payer = await generateKeyPairSigner();
const client = createDefaultRpcClient({
    url: 'https://api.devnet.solana.com',
    payer,
});

await client.send([myInstruction]);
```

#### Features

- `client.rpc`: RPC methods for interacting with the Solana cluster.
- `client.rpcSubscriptions`: Subscription methods for real-time updates.
- `client.payer`: The main payer signer for transactions.
- `client.transactionPlanner`: Plans instructions into transaction messages.
- `client.transactionPlanExecutor`: Executes planned transaction messages.
- `client.send`: Sends instructions or instruction plans to the cluster by using the client's transaction planner and executor.

#### Configuration

| Option                   | Type                     | Description                                                                                    |
| ------------------------ | ------------------------ | ---------------------------------------------------------------------------------------------- |
| `url` (required)         | `string`                 | URL of the Solana RPC endpoint.                                                                |
| `payer` (required)       | `TransactionSigner`      | Signer used to pay for transaction fees and on-chain account storage.                          |
| `rpcSubscriptionsConfig` | `RpcSubscriptionsConfig` | Configuration for RPC subscriptions. Use `rpcSubscriptionsConfig.url` to specify its endpoint. |

### `createDefaultLocalhostRpcClient`

Pre-configured client for localhost development with automatic payer funding.

```ts
import { createDefaultLocalhostRpcClient } from '@solana/kit-plugins';
import { lamports } from '@solana/kit';

const client = await createDefaultLocalhostRpcClient();

// Payer is automatically generated and funded
console.log('Payer address:', client.payer.address);
await client.send([myInstruction]);

// Request additional funding
await client.airdrop(client.payer.address, lamports(5_000_000_000n));
```

#### Features

- `client.rpc`: RPC methods for interacting with the local validator (i.e. `http://127.0.0.1:8899`).
- `client.rpcSubscriptions`: Subscription methods for real-time updates from the local validator (i.e. `ws://127.0.0.1:8900`).
- `client.payer`: The main payer signer for transactions.
- `client.airdrop`: Function to request SOL from the local faucet.
- `client.transactionPlanner`: Plans instructions into transaction messages.
- `client.transactionPlanExecutor`: Executes planned transaction messages.
- `client.send`: Sends instructions or instruction plans to the cluster by using the client's transaction planner and executor.

#### Configuration

| Option  | Type                | Description                                                                                                     |
| ------- | ------------------- | --------------------------------------------------------------------------------------------------------------- |
| `payer` | `TransactionSigner` | Signer used to pay for transaction fees and on-chain account storage. Defaults to a generated and funded payer. |

### `createDefaultLiteSVMClient`

Pre-configured client using LiteSVM for testing without an RPC connection.

```ts
import { createDefaultLiteSVMClient } from '@solana/kit-plugins';

const client = await createDefaultLiteSVMClient();

// Set up test environment
client.svm.setAccount(myTestAccount);
client.svm.addProgramFromFile(myProgramAddress, 'program.so');

// Execute transactions locally
await client.send([myInstruction]);
```

#### Features

- `client.svm`: Embedded LiteSVM instance for local blockchain simulation.
- `client.rpc`: Subset of RPC methods that delegate to the LiteSVM instance.
- `client.payer`: The main payer signer for transactions.
- `client.airdrop`: Function to request SOL from the LiteSVM instance.
- `client.transactionPlanner`: Plans instructions into transaction messages.
- `client.transactionPlanExecutor`: Executes planned transaction messages.
- `client.send`: Sends instructions or instruction plans to the cluster by using the client's transaction planner and executor.

#### Configuration

| Option  | Type                | Description                                                                                                     |
| ------- | ------------------- | --------------------------------------------------------------------------------------------------------------- |
| `payer` | `TransactionSigner` | Signer used to pay for transaction fees and on-chain account storage. Defaults to a generated and funded payer. |

## Individual Plugins

This package includes and re-exports all the individual plugin packages in this monorepo. You can also install and use them separately:

| Plugin               | Purpose                            | Package                                                                 |
| -------------------- | ---------------------------------- | ----------------------------------------------------------------------- |
| **RPC**              | Connect to Solana clusters         | [`@solana/kit-plugin-rpc`](../kit-plugin-rpc)                           |
| **Payer**            | Manage transaction fee payers      | [`@solana/kit-plugin-payer`](../kit-plugin-payer)                       |
| **Airdrop**          | Request SOL from faucets           | [`@solana/kit-plugin-airdrop`](../kit-plugin-airdrop)                   |
| **LiteSVM**          | Local blockchain simulation        | [`@solana/kit-plugin-litesvm`](../kit-plugin-litesvm)                   |
| **Instruction Plan** | Transaction planning and execution | [`@solana/kit-plugin-instruction-plan`](../kit-plugin-instruction-plan) |
