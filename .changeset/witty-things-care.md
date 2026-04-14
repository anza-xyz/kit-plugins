---
'@solana/kit-plugin-rpc': minor
'@solana/kit-plugin-litesvm': minor
---

Remove the `payer` config option from `rpcTransactionPlanner` and `litesvmTransactionPlanner`. The payer must now be set on the client before applying these plugins.

**BREAKING CHANGES**

**`payer` config option removed from transaction planner plugins.** The payer can no longer be passed as a config override. Use a payer plugin on the client instead.

```diff
- createClient().use(rpcTransactionPlanner({ payer: myPayer }));
+ createClient().use(payer(myPayer)).use(rpcTransactionPlanner());
```
