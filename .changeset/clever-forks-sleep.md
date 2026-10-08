---
'@solana/kit-plugin-litesvm': patch
'@solana/kit-plugin-rpc': patch
---

Fix `rpcTransactionPlanner` and `litesvmTransactionPlanner` not forwarding the options of Kit's `createTransactionPlanner`. Every option except `createTransactionMessage` (which the planners provide themselves) is now accepted, currently `maxInstructionsPerTransaction` and `onTransactionMessageUpdated`. These options are available for every transaction version and can also be set through the `transactionConfig` option of `solanaRpc` (and its variants) and `litesvm`. For legacy and version 0 transactions, the compute budget instructions added by the planner count towards `maxInstructionsPerTransaction`.

```ts
const client = createClient()
    .use(payer(myPayer))
    .use(
        solanaRpc({
            rpcUrl: 'https://api.mainnet-beta.solana.com',
            transactionConfig: { maxInstructionsPerTransaction: 32 },
        }),
    );
```
