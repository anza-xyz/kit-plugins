# Kit Plugins ➤ LiteSVM Client

[![npm][npm-image]][npm-url]
[![npm-downloads][npm-downloads-image]][npm-url]

[npm-downloads-image]: https://img.shields.io/npm/dm/@solana/kit-client-litesvm.svg?style=flat
[npm-image]: https://img.shields.io/npm/v/@solana/kit-client-litesvm.svg?style=flat&label=%40solana%2Fkit-client-litesvm
[npm-url]: https://www.npmjs.com/package/@solana/kit-client-litesvm

This package provides a pre-configured LiteSVM client for Solana Kit. It bundles several plugins together so you can get started with a single function call.

> [!NOTE]
> This package is only available in Node.js environments. LiteSVM relies on Node.js APIs and cannot run in browsers or React Native.

## Installation

```sh
pnpm install @solana/kit-client-litesvm
```

## `createClient`

Pre-configured client using LiteSVM for testing without an RPC connection.

```ts
import { createClient } from '@solana/kit-client-litesvm';

const client = await createClient();

// Set up test environment
client.svm.setAccount(myTestAccount);
client.svm.addProgramFromFile(myProgramAddress, 'program.so');

// Execute transactions locally
await client.sendTransaction([myInstruction]);
```

### Features

- `client.svm`: Embedded LiteSVM instance for local blockchain simulation.
- `client.rpc`: Subset of RPC methods that delegate to the LiteSVM instance.
- `client.payer`: The main payer signer for transactions.
- `client.airdrop`: Function to request SOL from the LiteSVM instance.
- `client.transactionPlanner`: Plans instructions into transaction messages.
- `client.transactionPlanExecutor`: Executes planned transaction messages.
- `client.sendTransactions`: Sends transaction messages, instructions or instruction plans to the cluster by using the client's transaction planner and executor.
- `client.sendTransaction`: Same as `client.sendTransactions` but ensuring only a single transaction is sent.

### Configuration

| Option  | Type                | Description                                                                                                     |
| ------- | ------------------- | --------------------------------------------------------------------------------------------------------------- |
| `payer` | `TransactionSigner` | Signer used to pay for transaction fees and on-chain account storage. Defaults to a generated and funded payer. |
