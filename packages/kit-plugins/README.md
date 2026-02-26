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

## Default Clients (deprecated)

> [!WARNING]
> The default client factories have moved to dedicated packages. The re-exports below are deprecated and will be removed in a future release.
>
> | Deprecated re-export              | Use instead                                                               |
> | --------------------------------- | ------------------------------------------------------------------------- |
> | `createDefaultRpcClient`          | `createClient` from [`@solana/kit-client-rpc`](../kit-client-rpc)         |
> | `createDefaultLocalhostRpcClient` | `createLocalClient` from [`@solana/kit-client-rpc`](../kit-client-rpc)    |
> | `createDefaultLiteSVMClient`      | `createClient` from [`@solana/kit-client-litesvm`](../kit-client-litesvm) |

## Individual Plugins

This package includes and re-exports all the individual plugin packages in this monorepo. You can also install and use them separately:

| Plugin               | Purpose                            | Package                                                                 |
| -------------------- | ---------------------------------- | ----------------------------------------------------------------------- |
| **RPC**              | Connect to Solana clusters         | [`@solana/kit-plugin-rpc`](../kit-plugin-rpc)                           |
| **Payer**            | Manage transaction fee payers      | [`@solana/kit-plugin-payer`](../kit-plugin-payer)                       |
| **Airdrop**          | Request SOL from faucets           | [`@solana/kit-plugin-airdrop`](../kit-plugin-airdrop)                   |
| **LiteSVM**          | Local blockchain simulation        | [`@solana/kit-plugin-litesvm`](../kit-plugin-litesvm)                   |
| **Instruction Plan** | Transaction planning and execution | [`@solana/kit-plugin-instruction-plan`](../kit-plugin-instruction-plan) |
