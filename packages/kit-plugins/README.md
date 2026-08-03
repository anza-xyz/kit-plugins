# Kit Plugins ➤ Main Library (deprecated)

[![npm][npm-image]][npm-url]
[![npm-downloads][npm-downloads-image]][npm-url]

[npm-downloads-image]: https://img.shields.io/npm/dm/@solana/kit-plugins.svg?style=flat
[npm-image]: https://img.shields.io/npm/v/@solana/kit-plugins.svg?style=flat&label=%40solana%2Fkit-plugins
[npm-url]: https://www.npmjs.com/package/@solana/kit-plugins

> [!WARNING]
> This package is deprecated. Install individual plugin packages directly instead.
>
> | Deprecated import from `@solana/kit-plugins`                                                 | Use instead                                                                                                                                                                                                                  |
> | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | `rpc`, `localhostRpc`, `rpcAirdrop`, `rpcTransactionPlanner`, `rpcTransactionPlanExecutor`   | `solanaRpcConnection`, `rpcAirdrop`, etc. from [`@solana/kit-plugin-rpc`](https://github.com/anza-xyz/kit-plugins/tree/497b55f/packages/kit-plugin-rpc)                                                                      |
> | `payer`, `payerFromFile`, `generatedPayer`, `generatedPayerWithSol`, `payerOrGeneratedPayer` | [`@solana/kit-plugin-signer`](https://github.com/anza-xyz/kit-plugins/tree/497b55f/packages/kit-plugin-signer)                                                                                                               |
> | `litesvm`, `litesvmAirdrop`, `litesvmTransactionPlanner`, `litesvmTransactionPlanExecutor`   | [`@solana/kit-plugin-litesvm`](https://github.com/anza-xyz/kit-plugins/tree/497b55f/packages/kit-plugin-litesvm)                                                                                                             |
> | `transactionPlanner`, `transactionPlanExecutor`, `planAndSendTransactions`                   | [`@solana/kit-plugin-instruction-plan`](https://github.com/anza-xyz/kit-plugins/tree/497b55f/packages/kit-plugin-instruction-plan)                                                                                           |
> | `airdrop`                                                                                    | [`@solana/kit-plugin-rpc`](https://github.com/anza-xyz/kit-plugins/tree/497b55f/packages/kit-plugin-rpc) or [`@solana/kit-plugin-litesvm`](https://github.com/anza-xyz/kit-plugins/tree/497b55f/packages/kit-plugin-litesvm) |
> | `createDefaultRpcClient`                                                                     | `solanaRpc` from [`@solana/kit-plugin-rpc`](https://github.com/anza-xyz/kit-plugins/tree/497b55f/packages/kit-plugin-rpc)                                                                                                    |
> | `createDefaultLocalhostRpcClient`                                                            | `solanaLocalRpc` from [`@solana/kit-plugin-rpc`](https://github.com/anza-xyz/kit-plugins/tree/497b55f/packages/kit-plugin-rpc)                                                                                               |
> | `createDefaultLiteSVMClient`                                                                 | `litesvm` from [`@solana/kit-plugin-litesvm`](https://github.com/anza-xyz/kit-plugins/tree/497b55f/packages/kit-plugin-litesvm)                                                                                              |
