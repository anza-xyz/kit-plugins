import { type DependencyList, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

import { createReactiveActionStore, type ReactiveActionState } from '../kit-prereqs';

/**
 * State tracked by {@link useAction}.
 *
 * Also returned by the transaction hooks. Extends Kit's
 * `ReactiveActionState<TResult>` (which carries `data`, `error`, and
 * `status`) with React-ergonomic additions: a stable `send(...)` function
 * that maps to the underlying store's `dispatch`, a stable `reset()`, and
 * `is*` booleans derived from `status` so consumers can pick whichever
 * reads better at the call site.
 *
 * @typeParam TArgs - Tuple of argument types accepted by `send`.
 * @typeParam TResult - Result type produced by each successful dispatch.
 */
export type ActionResult<TArgs extends unknown[], TResult> = ReactiveActionState<TResult> & {
    /** `true` when `status === 'error'`. */
    isError: boolean;
    /** `true` when `status === 'idle'`. */
    isIdle: boolean;
    /** `true` when `status === 'running'` — a call is in flight. */
    isRunning: boolean;
    /** `true` when `status === 'success'`. */
    isSuccess: boolean;
    /** Reset back to `idle`, aborting any in-flight call. Stable reference. */
    reset: () => void;
    /**
     * Fire-and-forget dispatch. Returns `undefined` synchronously and
     * never throws — failures surface on `status` / `error`, and
     * superseded or `reset()`-aborted calls produce no state update. Use
     * from UI event handlers; there's no promise to handle or `.catch()`.
     * Stable reference.
     *
     * @see {@link ActionResult.sendAsync} when you need the resolved
     *      value or propagated errors.
     */
    send: (...args: TArgs) => void;
    /**
     * Promise-returning dispatch for imperative flows (e.g. navigate on
     * success, post signed bytes to an API). Resolves with the operation's
     * result; rejects on failure or with `AbortError` on supersede — filter
     * the latter with {@link isAbortError}. Stable reference.
     */
    sendAsync: (...args: TArgs) => Promise<TResult>;
};

/**
 * Tracks the async state of a user-triggered action.
 *
 * Backed by {@link createReactiveActionStore}: the state machine,
 * abort-on-supersede, and stale-while-revalidate semantics live in the
 * Kit primitive. The wrapped function receives an `AbortSignal` as its
 * first argument so HTTP / RPC / wallet calls can be cancelled when
 * superseded by a fresh `send` or by `reset()`.
 *
 * @typeParam TArgs - Tuple of argument types accepted by `send`.
 * @typeParam TResult - Result type produced by each successful call.
 * @param fn - The async operation to invoke on each `send`. Receives an
 *             `AbortSignal` plus the caller's args.
 * @param deps - Dependency list controlling when the underlying store is
 *               rebuilt. Matches React's hook-dep conventions.
 * @return An {@link ActionResult} with `send`, `sendAsync`, `reset`,
 *         `status`, `data`, `error`, and `is*` booleans.
 *
 * @example
 * ```tsx
 * const signMessage = useAction(
 *     async (signal, message: Uint8Array) => signer.signMessage(message, { abortSignal: signal }),
 *     [signer],
 * );
 * const signature = await signMessage.sendAsync(new TextEncoder().encode('hello'));
 * ```
 *
 * @see {@link ActionResult}
 * @see {@link isAbortError}
 */
export function useAction<TArgs extends unknown[], TResult>(
    fn: (signal: AbortSignal, ...args: TArgs) => Promise<TResult>,
    deps: DependencyList = [],
): ActionResult<TArgs, TResult> {
    // Latest-ref pattern: the store below is built once per `deps` change, but
    // the operation it wraps must always call the freshest `fn` closure so it
    // sees up-to-date values captured from the caller's render. Storing `fn`
    // in a ref and updating it after every render keeps the store stable
    // across renders without stale closures.
    const fnRef = useRef(fn);
    useEffect(() => {
        fnRef.current = fn;
    });
    const store = useMemo(
        () => createReactiveActionStore<TArgs, TResult>((signal, ...args) => fnRef.current(signal, ...args)),
        deps,
    );
    const snapshot = useSyncExternalStore(store.subscribe, store.getState, store.getState);
    return useMemo(
        () => ({
            data: snapshot.data,
            error: snapshot.error,
            isError: snapshot.status === 'error',
            isIdle: snapshot.status === 'idle',
            isRunning: snapshot.status === 'running',
            isSuccess: snapshot.status === 'success',
            reset: store.reset,
            send: store.dispatch,
            sendAsync: store.dispatchAsync,
            status: snapshot.status,
        }),
        [snapshot, store],
    );
}
