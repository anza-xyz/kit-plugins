---
'@solana/kit-plugin-litesvm': minor
---

Add version 1 transaction execution support by raising the `litesvm` dependency floor from `^1.3.0` to `^1.4.1`. This upgrades the local SVM to Agave 4.2, aligns litesvm's own `@solana/kit` dependency with v8, and makes transaction plans created with `litesvmTransactionPlanner({ version: 1 })` executable end to end. Since unset resource limits in a version 1 transaction config are treated as zero by the runtime and LiteSVM performs no simulation-based estimation, the planner now writes maximum resource limits to the version 1 resource header by default, overridable via the new `computeUnitLimit` and `loadedAccountsDataSizeLimit` config options.
