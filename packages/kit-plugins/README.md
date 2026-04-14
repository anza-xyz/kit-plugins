# Kit Plugins ➤ Main Library (deprecated)

[![npm][npm-image]][npm-url]
[![npm-downloads][npm-downloads-image]][npm-url]

[npm-downloads-image]: https://img.shields.io/npm/dm/@solana/kit-plugins.svg?style=flat
[npm-image]: https://img.shields.io/npm/v/@solana/kit-plugins.svg?style=flat&label=%40solana%2Fkit-plugins
[npm-url]: https://www.npmjs.com/package/@solana/kit-plugins

> [!WARNING]
> This package is deprecated. Install individual plugin packages directly instead.
>
> | Deprecated import from `@solana/kit-plugins`                                                 | Use instead                                                                                                                      |
> | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
> | `rpc`, `localhostRpc`, `rpcAirdrop`, `rpcTransactionPlanner`, `rpcTransactionPlanExecutor`   | `solanaRpcConnection`, `solanaRpcSubscriptionsConnection`, `rpcAirdrop`, etc. from [`@solana/kit-plugin-rpc`](../kit-plugin-rpc) |
> | `payer`, `payerFromFile`, `generatedPayer`, `generatedPayerWithSol`, `payerOrGeneratedPayer` | [`@solana/kit-plugin-payer`](../kit-plugin-payer)                                                                                |
> | `litesvm`, `litesvmAirdrop`, `litesvmTransactionPlanner`, `litesvmTransactionPlanExecutor`   | [`@solana/kit-plugin-litesvm`](../kit-plugin-litesvm)                                                                            |
> | `transactionPlanner`, `transactionPlanExecutor`, `planAndSendTransactions`                   | [`@solana/kit-plugin-instruction-plan`](../kit-plugin-instruction-plan)                                                          |
> | `airdrop`                                                                                    | [`@solana/kit-plugin-rpc`](../kit-plugin-rpc) or [`@solana/kit-plugin-litesvm`](../kit-plugin-litesvm)                           |
> | `createDefaultRpcClient`                                                                     | `solanaRpc` from [`@solana/kit-plugin-rpc`](../kit-plugin-rpc)                                                                   |
> | `createDefaultLocalhostRpcClient`                                                            | `solanaLocalRpc` from [`@solana/kit-plugin-rpc`](../kit-plugin-rpc)                                                              |
> | `createDefaultLiteSVMClient`                                                                 | `litesvm` from [`@solana/kit-plugin-litesvm`](../kit-plugin-litesvm)                                                             |
