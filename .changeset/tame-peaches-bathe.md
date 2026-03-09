---
'@solana/kit-plugin-instruction-plan': minor
---

Re-wrap `FAILED_TO_EXECUTE_TRANSACTION_PLAN` errors into user-facing `FAILED_TO_SEND_TRANSACTION` / `FAILED_TO_SEND_TRANSACTIONS` errors in `sendTransaction` and `sendTransactions`, unwrapping preflight error details.
