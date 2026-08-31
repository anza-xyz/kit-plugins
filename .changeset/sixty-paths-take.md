---
'@solana/kit-plugin-rpc': patch
---

Stop preparing and sending queued transactions after the abort signal fires.

When a transaction plan had more leaves than `maxConcurrency`, leaves waiting for a concurrency slot would still fetch a blockhash, estimate resource limits, sign and send once a slot freed up — even if the plan execution had already been aborted. The sending executor now bails out of queued executions as soon as the abort signal is aborted.
