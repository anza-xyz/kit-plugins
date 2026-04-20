import { getAbortablePromise } from '@solana/promises';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** Discrete lifecycle status for an async action. */
export type ActionStatus = 'error' | 'idle' | 'running' | 'success';

/**
 * Reactive state and controls for an async action tracked by {@link useAction}.
 *
 * @typeParam TArgs - The argument tuple accepted by the wrapped function.
 * @typeParam TResult - The resolved value type of the wrapped function.
 */
export type ActionState<TArgs extends unknown[], TResult> = {
    /** The result of the last successful call, or `undefined`. */
    readonly data: TResult | undefined;
    /** The error thrown by the last failed call, or `undefined`. */
    readonly error: unknown;
    /** Reset `status`, `data`, and `error` back to their initial values. Stable. */
    readonly reset: () => void;
    /**
     * Invoke the wrapped function. Stable reference.
     *
     * Calling `send` while a previous call is in flight aborts the prior
     * call: its `await` rejects with an `AbortError`, and its outcome is
     * never written to state. Callers that `await send(...)` should handle
     * `AbortError` (e.g. `if ((err as Error).name === 'AbortError') return`)
     * to avoid surfacing stale errors to users.
     */
    readonly send: (...args: TArgs) => Promise<TResult>;
    /** The current lifecycle status. */
    readonly status: ActionStatus;
};

type InternalState<TResult> =
    | { data: TResult; error: undefined; status: 'success' }
    | { data: undefined; error: undefined; status: 'idle' | 'running' }
    | { data: undefined; error: unknown; status: 'error' };

const IDLE: InternalState<never> = { data: undefined, error: undefined, status: 'idle' };

/**
 * Track the lifecycle of an async, user-triggered action.
 *
 * Wraps an async function with status / data / error tracking, and returns a
 * stable `send` function plus reactive state. The returned `send` rethrows
 * on failure so callers can `try/catch` or `.catch()` — the hook just also
 * exposes the error reactively for UI rendering.
 *
 * **Abort semantics.** Every call to `send` creates a fresh `AbortController`.
 * If `send` is called again (or `reset()` runs) before the in-flight call
 * resolves, the prior controller is aborted: its `await` rejects with an
 * `AbortError`, and its outcome is never written to state. Stale callers
 * should catch the abort:
 *
 * ```tsx
 * try {
 *     await send(...);
 * } catch (err) {
 *     if ((err as Error).name === 'AbortError') return; // superseded
 *     // real error
 * }
 * ```
 *
 * The signal is passed as the *first argument* to the wrapped function —
 * threading it into your `fetch`, RPC, or plugin options provides true
 * cancellation of the underlying work. Ignore it (e.g. `_signal`) if the
 * wrapped function doesn't support cancellation; the outer await still
 * rejects on abort.
 *
 * This is the building block behind {@link useSendTransaction} and is exported
 * so you can wire up custom async flows (sign-then-send, partial signing,
 * external submission endpoints).
 *
 * @typeParam TArgs - The argument tuple accepted by the wrapped function.
 * @typeParam TResult - The resolved value type of the wrapped function.
 * @param fn - The async function to wrap. Receives an `AbortSignal` followed
 *   by the user-supplied args. A stable reference is preferred; changes to
 *   `fn` update the closure inside the returned `send`.
 * @returns Reactive state and controls ({@link ActionState}).
 *
 * The wrapped function does not need to be memoized — an internal ref keeps
 * `send` stable while always calling the latest closure, so capturing fresh
 * values from render (e.g. `client`) is safe.
 *
 * @example Using the signal for true cancellation
 * ```tsx
 * const { send, status, error } = useAction((signal, query: string) =>
 *     fetch(`/api/search?q=${query}`, { signal }).then(r => r.json()),
 * );
 * await send('hello');
 * ```
 *
 * @example Ignoring the signal
 * ```tsx
 * const { send } = useAction((_signal, to: Address, amount: Lamports) =>
 *     client.sendTransaction(getTransferInstruction({ source, destination: to, amount })),
 * );
 * ```
 */
export function useAction<TArgs extends unknown[], TResult>(
    fn: (signal: AbortSignal, ...args: TArgs) => Promise<TResult>,
): ActionState<TArgs, TResult> {
    const [state, setState] = useState<InternalState<TResult>>(IDLE);
    // Latest-ref pattern: keep `send` stable while always calling the newest
    // closure. The ref is updated in an effect (post-commit) rather than during
    // render so that a discarded concurrent render — e.g. a transition
    // interrupted by a higher-priority update — can't leave the ref pointing at
    // a closure that captured never-committed props / context. `send` is only
    // ever invoked from event handlers (which fire after commit), so the
    // one-render lag is never observable in practice.
    const fnRef = useRef(fn);
    useEffect(() => {
        fnRef.current = fn;
    });
    const currentControllerRef = useRef<AbortController | null>(null);

    const send = useCallback(async (...args: TArgs) => {
        // Abort any in-flight call. Its `await` rejects with AbortError so
        // stale caller code skips both its success and error branches.
        currentControllerRef.current?.abort();
        const controller = new AbortController();
        currentControllerRef.current = controller;

        setState({ data: undefined, error: undefined, status: 'running' });
        try {
            const data = await getAbortablePromise(fnRef.current(controller.signal, ...args), controller.signal);
            // If the signal aborted after fn resolved but before we got here
            // (another send or reset fired), skip the setState — the caller's
            // await still receives the value but state reflects the latest.
            if (!controller.signal.aborted) {
                setState({ data, error: undefined, status: 'success' });
            }
            return data;
        } catch (error) {
            if (controller.signal.aborted) {
                // Stale call — don't overwrite state set by the superseding
                // send or reset. Still rethrow so the caller's await settles
                // (callers should filter AbortError).
                throw error;
            }
            setState({ data: undefined, error, status: 'error' });
            throw error;
        }
    }, []);

    const reset = useCallback(() => {
        // Aborting before resetting prevents a slow in-flight call from
        // later flipping state out of idle.
        currentControllerRef.current?.abort();
        currentControllerRef.current = null;
        setState(IDLE);
    }, []);

    return useMemo(
        () => ({ data: state.data, error: state.error, reset, send, status: state.status }),
        [state, reset, send],
    );
}
