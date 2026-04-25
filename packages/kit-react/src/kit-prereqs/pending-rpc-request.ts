/**
 * TODO(move-to-kit): Replace with a native
 * `PendingRpcRequest<T>.reactiveStore(): ReactiveActionStore<[], T>` method
 * once Kit ships it (see the spec's "Prerequisites" section — change listed
 * as TODO on `@solana/rpc-spec`). When released, delete this file and call
 * `pending.reactiveStore()` directly at the call sites.
 */
import type { PendingRpcRequest } from '@solana/kit';

import { createReactiveActionStore, type ReactiveActionStore } from './reactive-action-store';

/**
 * Wraps a {@link PendingRpcRequest} as an eagerly-dispatched
 * {@link ReactiveActionStore}. Matches the semantics the spec calls out
 * for `PendingRpcRequest.reactiveStore()`: construction auto-dispatches
 * the request, subsequent `dispatch` calls fire a fresh RPC call.
 *
 * The per-dispatch abort signal is passed into `pending.send({ abortSignal })`,
 * so a supersede aborts the in-flight HTTP request cleanly.
 *
 * @internal
 */
export function reactiveStoreFromPendingRequest<T>(pending: PendingRpcRequest<T>): ReactiveActionStore<[], T> {
    const store = createReactiveActionStore<[], T>(signal => pending.send({ abortSignal: signal }));
    // Eager auto-dispatch: `.reactiveStore()` commits to "live now". The
    // fire-and-forget `dispatch` captures failures on state without
    // surfacing an unhandled rejection.
    store.dispatch();
    return store;
}
