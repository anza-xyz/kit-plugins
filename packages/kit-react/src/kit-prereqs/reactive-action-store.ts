/**
 * TODO(move-to-kit): Replace with the upstream implementation once
 * https://github.com/anza-xyz/kit/pull/1550 lands. The upstream PR adds
 * `ReactiveActionStore` and `createReactiveActionStore` to
 * `@solana/subscribable`. When released, delete this file and re-export
 * from `@solana/kit` (or `@solana/subscribable`) directly.
 */

/**
 * Lifecycle of a {@link ReactiveActionStore}.
 *
 * - `idle`: no invocation has been dispatched yet.
 * - `running`: an invocation is in flight.
 * - `success`: the most recent invocation resolved.
 * - `error`: the most recent invocation rejected.
 *
 * A fresh dispatch while another is in flight supersedes it (aborts the
 * prior signal), so only the newest invocation's outcome is ever visible.
 * The store is stale-while-revalidate: during `running` after a prior
 * `success`, `data` still holds the previous value so consumers can render
 * stale data with an overlay.
 */
export type ReactiveActionStatus = 'error' | 'idle' | 'running' | 'success';

/**
 * A snapshot of a {@link ReactiveActionStore}'s state.
 *
 * @typeParam T - The value type resolved by successful dispatches.
 */
export type ReactiveActionState<T> = Readonly<{
    /** Value of the most recent successful dispatch, or `undefined`. */
    data: T | undefined;
    /** Error of the most recent failed dispatch, or `undefined`. */
    error: unknown;
    /** Current lifecycle status. */
    status: ReactiveActionStatus;
}>;

/**
 * Reactive container for invocation-based async operations (user-triggered
 * actions, one-shot RPC reads).
 *
 * Compatible with `useSyncExternalStore` via
 * {@link ReactiveActionStore.subscribe} +
 * {@link ReactiveActionStore.getState}. All four methods are annotated
 * with `this: void` so callers can pass them as unbound references without
 * tripping the `unbound-method` lint.
 *
 * @typeParam TArgs - Tuple of argument types accepted by each invocation.
 * @typeParam T - Result type produced by each invocation.
 */
export type ReactiveActionStore<TArgs extends unknown[], T> = {
    /**
     * Fire-and-forget dispatch. Returns `undefined` synchronously and
     * never throws — failures surface on state as `{ status: 'error' }`,
     * and superseded or `reset()`-aborted calls produce no state update.
     * Use from UI event handlers; there's no promise to handle or
     * `.catch()`.
     *
     * @see {@link ReactiveActionStore.dispatchAsync} when you need the
     *      resolved value or propagated errors.
     */
    dispatch: (this: void, ...args: TArgs) => void;
    /**
     * Promise-returning dispatch for imperative callers. Resolves with the
     * wrapped function's result on success. Rejects with the thrown error
     * on failure, and with an `AbortError` when the call is superseded or
     * `reset()` is invoked — filter those with {@link isAbortError}.
     */
    dispatchAsync: (this: void, ...args: TArgs) => Promise<T>;
    /** The current `{ status, data, error }` snapshot. Reference-stable per update. */
    getState: (this: void) => ReactiveActionState<T>;
    /** Reset to `idle`, clearing `data` and `error`. Aborts any in-flight call. */
    reset: (this: void) => void;
    /**
     * Subscribe to state changes. Returns an idempotent unsubscribe. Safe
     * to call multiple times with the same callback.
     */
    subscribe: (this: void, listener: () => void) => () => void;
};

const IDLE_STATE: ReactiveActionState<never> = Object.freeze({
    data: undefined,
    error: undefined,
    status: 'idle',
});

/**
 * Creates a {@link ReactiveActionStore} around the given async operation.
 *
 * The operation receives an {@link AbortSignal} as its first argument so
 * it can cancel HTTP / RPC / wallet calls when superseded. A second
 * `dispatch` while a prior one is in flight aborts the first signal,
 * giving the common "click twice, only the second submits" UX. The store
 * is neutral on initiation: nothing fires until the first `dispatch`
 * call. Callers who want eager auto-dispatch (such as
 * `PendingRpcRequest.reactiveStore()`) dispatch once themselves after
 * construction.
 *
 * @typeParam TArgs - Tuple of argument types accepted by `dispatch`.
 * @typeParam T - Result type produced by each successful dispatch.
 * @param operation - The async operation to invoke on each dispatch.
 * @return A fresh {@link ReactiveActionStore} in `idle` state.
 *
 * @example
 * ```ts
 * const store = createReactiveActionStore<[number], number>(
 *     async (_signal, n) => n * 2,
 * );
 * await store.dispatchAsync(21); // resolves to 42
 * store.getState(); // { status: 'success', data: 42, error: undefined }
 * ```
 */
export function createReactiveActionStore<TArgs extends unknown[], T>(
    operation: (signal: AbortSignal, ...args: TArgs) => Promise<T>,
): ReactiveActionStore<TArgs, T> {
    const listeners = new Set<() => void>();
    let state: ReactiveActionState<T> = IDLE_STATE;
    let activeController: AbortController | undefined;

    const notify = () => {
        for (const listener of [...listeners]) listener();
    };

    const setState = (next: ReactiveActionState<T>) => {
        if (next === state) return;
        state = next;
        notify();
    };

    const abortActive = () => {
        const controller = activeController;
        if (!controller) return;
        activeController = undefined;
        controller.abort();
    };

    const dispatchAsync = (...args: TArgs): Promise<T> => {
        abortActive();
        const controller = new AbortController();
        activeController = controller;
        setState({
            data: state.data,
            error: undefined,
            status: 'running',
        });
        const { signal } = controller;
        const promise = operation(signal, ...args);
        promise.then(
            value => {
                if (activeController !== controller) return;
                activeController = undefined;
                setState({ data: value, error: undefined, status: 'success' });
            },
            error => {
                if (activeController !== controller) return;
                activeController = undefined;
                setState({ data: state.data, error, status: 'error' });
            },
        );
        return promise;
    };

    const store: ReactiveActionStore<TArgs, T> = {
        dispatch(...args) {
            // Swallow the rejection so the fire-and-forget contract holds
            // (state still captures it via the `.then(..., error => ...)`
            // branch inside `dispatchAsync`).
            dispatchAsync(...args).catch(() => {});
        },
        dispatchAsync,
        getState() {
            return state;
        },
        reset() {
            abortActive();
            setState(IDLE_STATE);
        },
        subscribe(listener) {
            listeners.add(listener);
            let unsubscribed = false;
            return () => {
                if (unsubscribed) return;
                unsubscribed = true;
                listeners.delete(listener);
            };
        },
    };

    return store;
}
