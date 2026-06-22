---
'@solana/kit-plugin-rpc': minor
---

Use Kit's resource limit estimation helpers in the RPC transaction planner and executor. In addition to the compute unit limit, the executor now estimates the loaded accounts data size limit for version 1 transactions, and the planner fills provisory resource limits accordingly. Behavior is unchanged for legacy and version 0 transactions.
