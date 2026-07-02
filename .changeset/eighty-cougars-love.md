---
'@solana/kit-plugin-instruction-plan': minor
---

Add a `/react` subpath with `usePlanTransaction`, `usePlanTransactions`, `useSendTransaction` and `useSendTransactions` hooks that wrap the client's planning and sending functions using `useClientCapability` and `useAction` from `@solana/react`. `react` and `@solana/react` are optional peer dependencies.

```tsx
import { useSendTransaction } from '@solana/kit-plugin-instruction-plan/react';

function SendButton({ instructionPlan }) {
    const { dispatch, isRunning, error } = useSendTransaction();
    return (
        <button disabled={isRunning} onClick={() => dispatch(instructionPlan)}>
            {isRunning ? 'Sending…' : 'Send'}
            {error ? <span role="alert">Failed</span> : null}
        </button>
    );
}
```
