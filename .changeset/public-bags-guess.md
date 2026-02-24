---
'@solana/kit-plugin-instruction-plan': minor
---

Add `skipPreflight` option to `defaultTransactionPlannerAndExecutorFromRpc`

The executor now handles preflight simulation intelligently based on whether compute unit estimation was performed:

- When estimation succeeds, preflight is skipped (avoiding a redundant second simulation).
- When the transaction has an explicit compute unit limit (no estimation needed), preflight runs as the only simulation.
- Setting `skipPreflight: true` always skips preflight, and additionally recovers from failed CU estimation simulations by using the consumed units from the failure to set the compute unit limit.

The compute unit estimation logic has been replaced with a direct use of `estimateComputeUnitLimitFactory` and `findSetComputeUnitLimitInstructionIndexAndUnits` from `@solana-program/compute-budget@0.14.0`, giving the executor full control over the estimation-to-send pipeline.
