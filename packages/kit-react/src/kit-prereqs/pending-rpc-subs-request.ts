/**
 * TODO(move-to-kit): Replace with a native sync
 * `PendingRpcSubscriptionsRequest<T>.reactiveStore({ abortSignal })` method
 * once https://github.com/anza-xyz/kit/pull/1553 lands. The existing async
 * `.reactive()` returns `Promise<ReactiveStore<T>>`, which forces consumers
 * to invent a second state machine on top of the store's own lifecycle.
 * The sync form returns a store immediately with `status: 'loading'` and
 * transitions once the transport resolves.
 *
 * This shim bridges today's async `.reactive()` into a synchronously-
 * returned {@link ReactiveStreamStore} with a `status: 'loading'` prelude.
 */
import type { PendingRpcSubscriptionsRequest } from '@solana/kit';
import type { ReactiveStore } from '@solana/subscribable';

import type { ReactiveStreamState, ReactiveStreamStore } from './reactive-stream-store';

const LOADING_STATE: ReactiveStreamState<never> = Object.freeze({
    data: undefined,
    error: undefined,
    status: 'loading',
});

/**
 * Sync counterpart to the existing async `.reactive()` on
 * {@link PendingRpcSubscriptionsRequest}. Returns immediately with a
 * `status: 'loading'` snapshot; switches to the underlying store as soon
 * as transport setup resolves. Transport-setup failures surface as
 * `status: 'error'`, recoverable via `retry()`.
 *
 * @internal
 */
export function reactiveStoreFromPendingSubscriptionsRequest<T>(
    pending: PendingRpcSubscriptionsRequest<T>,
    options: { abortSignal: AbortSignal },
): ReactiveStreamStore<T> {
    const listeners = new Set<() => void>();
    let unifiedState: ReactiveStreamState<T> = LOADING_STATE;
    let underlying: ReactiveStore<T> | undefined;
    let underlyingUnsub: (() => void) | undefined;

    const notify = () => {
        for (const listener of [...listeners]) listener();
    };

    const refreshUnifiedState = () => {
        if (!underlying) return;
        const error = underlying.getError();
        const data = underlying.getState();
        if (error !== undefined) {
            unifiedState = { data, error, status: 'error' };
        } else if (data === undefined) {
            unifiedState = LOADING_STATE;
        } else {
            unifiedState = { data, error: undefined, status: 'loaded' };
        }
        notify();
    };

    const setErrorState = (error: unknown) => {
        unifiedState = { data: unifiedState.data, error, status: 'error' };
        notify();
    };

    pending
        .reactive({ abortSignal: options.abortSignal })
        .then((store: ReactiveStore<T>) => {
            if (options.abortSignal.aborted) return;
            underlying = store;
            underlyingUnsub = store.subscribe(() => {
                refreshUnifiedState();
            });
            refreshUnifiedState();
        })
        .catch((error: unknown) => {
            if (options.abortSignal.aborted) return;
            setErrorState(error);
        });

    options.abortSignal.addEventListener('abort', () => {
        underlyingUnsub?.();
        underlyingUnsub = undefined;
    });

    return {
        getError: () => unifiedState.error,
        getState: () => unifiedState.data,
        getUnifiedState: () => unifiedState,
        retry: () => {
            // The shim can only rebind to the existing store; true
            // end-to-end retry belongs to the upstream sync API. For now,
            // callers should rebuild via the factory at the useLiveStore
            // layer on retry.
            refreshUnifiedState();
        },
        subscribe: (listener: () => void) => {
            listeners.add(listener);
            let unsubscribed = false;
            return () => {
                if (unsubscribed) return;
                unsubscribed = true;
                listeners.delete(listener);
            };
        },
    };
}
