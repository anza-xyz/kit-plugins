# Kit Plugins ➤ RPC Client

[![npm][npm-image]][npm-url]
[![npm-downloads][npm-downloads-image]][npm-url]

[npm-downloads-image]: https://img.shields.io/npm/dm/@solana/kit-client-rpc.svg?style=flat
[npm-image]: https://img.shields.io/npm/v/@solana/kit-client-rpc.svg?style=flat&label=%40solana%2Fkit-client-rpc
[npm-url]: https://www.npmjs.com/package/@solana/kit-client-rpc

This package provides pre-configured RPC clients for Solana Kit. It bundles several plugins together so you can get started with a single function call.

## Installation

```sh
pnpm install @solana/kit-client-rpc
```

## `createDefaultRpcClient`

Pre-configured client for production use with real Solana clusters.

```ts
import { createDefaultRpcClient } from '@solana/kit-client-rpc';
import { generateKeyPairSigner } from '@solana/kit';

const payer = await generateKeyPairSigner();
const client = createDefaultRpcClient({
    url: 'https://api.devnet.solana.com',
    payer,
});

await client.sendTransaction([myInstruction]);
```

### Features

- `client.rpc`: RPC methods for interacting with the Solana cluster.
- `client.rpcSubscriptions`: Subscription methods for real-time updates.
- `client.payer`: The main payer signer for transactions.
- `client.transactionPlanner`: Plans instructions into transaction messages.
- `client.transactionPlanExecutor`: Executes planned transaction messages.
- `client.sendTransactions`: Sends transaction messages, instructions or instruction plans to the cluster by using the client's transaction planner and executor.
- `client.sendTransaction`: Same as `client.sendTransactions` but ensuring only a single transaction is sent.

### Configuration

| Option                   | Type                     | Description                                                                                    |
| ------------------------ | ------------------------ | ---------------------------------------------------------------------------------------------- |
| `url` (required)         | `string`                 | URL of the Solana RPC endpoint.                                                                |
| `payer` (required)       | `TransactionSigner`      | Signer used to pay for transaction fees and on-chain account storage.                          |
| `rpcSubscriptionsConfig` | `RpcSubscriptionsConfig` | Configuration for RPC subscriptions. Use `rpcSubscriptionsConfig.url` to specify its endpoint. |

## `createDefaultLocalhostRpcClient`

Pre-configured client for localhost development with automatic payer funding.

```ts
import { createDefaultLocalhostRpcClient } from '@solana/kit-client-rpc';
import { lamports } from '@solana/kit';

const client = await createDefaultLocalhostRpcClient();

// Payer is automatically generated and funded
console.log('Payer address:', client.payer.address);
await client.sendTransaction([myInstruction]);

// Request additional funding
await client.airdrop(client.payer.address, lamports(5_000_000_000n));
```

### Features

- `client.rpc`: RPC methods for interacting with the local validator (i.e. `http://127.0.0.1:8899`).
- `client.rpcSubscriptions`: Subscription methods for real-time updates from the local validator (i.e. `ws://127.0.0.1:8900`).
- `client.payer`: The main payer signer for transactions.
- `client.airdrop`: Function to request SOL from the local faucet.
- `client.transactionPlanner`: Plans instructions into transaction messages.
- `client.transactionPlanExecutor`: Executes planned transaction messages.
- `client.sendTransactions`: Sends transaction messages, instructions or instruction plans to the cluster by using the client's transaction planner and executor.
- `client.sendTransaction`: Same as `client.sendTransactions` but ensuring only a single transaction is sent.

### Configuration

| Option                   | Type                | Description                                                                                                     |
| ------------------------ | ------------------- | --------------------------------------------------------------------------------------------------------------- |
| `payer`                  | `TransactionSigner` | Signer used to pay for transaction fees and on-chain account storage. Defaults to a generated and funded payer. |
| `url`                    | `string`            | Custom RPC URL. Defaults to `http://127.0.0.1:8899`.                                                            |
| `rpcSubscriptionsConfig` | `{ url: string }`   | Custom WebSocket URL. Defaults to `ws://127.0.0.1:8900`.                                                        |
