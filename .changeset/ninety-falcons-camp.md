---
'@solana/kit-plugin-rpc': minor
'@solana/kit-plugin-litesvm': minor
'@solana/kit-plugin-instruction-plan': minor
'@solana/kit-plugins': minor
'@solana/kit-client-rpc': patch
'@solana/kit-client-litesvm': patch
---

Move RPC and LiteSVM transaction planner/executor plugins out of `@solana/kit-plugin-instruction-plan` into `@solana/kit-plugin-rpc` and `@solana/kit-plugin-litesvm` respectively.

#### Breaking changes

- **`@solana/kit-plugin-instruction-plan`**: Removed `defaultTransactionPlannerAndExecutorFromRpc` and `defaultTransactionPlannerAndExecutorFromLitesvm`. Use the new separate plugins from their respective packages instead.

#### New features

- **`@solana/kit-plugin-rpc`**: Added `rpcTransactionPlanner()` and `rpcTransactionPlanExecutor()` plugins.
- **`@solana/kit-plugin-litesvm`**: Added `litesvmTransactionPlanner()` and `litesvmTransactionPlanExecutor()` plugins.
