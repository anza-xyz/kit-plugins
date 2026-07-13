---
'@solana/kit-plugin-wallet': minor
---

Add readiness helpers for the initial auto-reconnect warm-up.

A freshly built client runs a silent auto-reconnect that briefly passes through the `'pending'` / `'reconnecting'` statuses before settling. This release adds an imperative and a declarative way to wait for that warm-up, both keyed off the same status set (and both ignoring user-initiated `'connecting'` / `'disconnecting'`, so a normal connect stays interactive):

- `client.wallet.whenReady()` returns a promise that resolves once the warm-up has settled. It's an advanced signal for apps that rebuild the client at runtime — for example, to change chain, since each wallet plugin is bound to a single chain. Awaiting it before swapping the new client in lets you hold the previous UI until the rebuilt client is ready instead of flashing a reconnecting state on every switch. Disposing a client mid-warm-up settles its status to `'disconnected'` and resolves any pending `whenReady()` promise, so a superseded client never leaves an `await` hanging.
- `useIsWalletReady()` (from `@solana/kit-plugin-wallet/react`) returns `false` during the warm-up and `true` once it settles, and `WalletReadyGate` is a thin `<Suspense fallback>`-shaped wrapper over it. Use them to hold back wallet-dependent UI so a persisted wallet never flashes "disconnected" before it reconnects.
- `isWalletWarmingUp(status)` is the shared predicate all of the above are built on, now exported for non-React consumers that bind `subscribe` / `getState` to their own framework and want to gate on the warm-up statuses directly.
