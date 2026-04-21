import { getAbortablePromise } from '@solana/promises';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** Discrete lifecycle status for an async action. */
export type ActionStatus = 'error' | 'idle' | 'running' | 'success';

/**
 * Returns `true` if `err` is an `AbortError` — the specific rejection
 * produced when a {@link useAction} `send` is superseded by a later call
 * or cancelled by `reset()`.
 *
 * Use this in `try`/`catch` around `await send(...)` to skip supersede
 * rejections. The hook's reactive state already reflects the newer call,
 * so the stale branch has nothing useful to do.
 *
 * @example
 * ```tsx
 * try {
 *     const result = await send(ix);
 *     navigate(`/tx/${result.signature}`);
 * } catch (err) {
 *     if (isAbortError(err)) return; // superseded — reactive state wins
 *     toast.error(String(err));
 * }
 * ```
 */
export function isAbortError(err: unknown): boolean {
    return err instanceof Error && err.name === 'AbortError';
}

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
    /** `true` when {@link status} is `'error'`. Derived; provided for `{isError && …}` rendering. */
    readonly isError: boolean;
    /** `true` when {@link status} is `'idle'` — no send has run yet, or `reset()` just cleared state. */
    readonly isIdle: boolean;
    /** `true` when {@link status} is `'running'` — a send is in flight. */
    readonly isRunning: boolean;
    /** `true` when {@link status} is `'success'`. */
    readonly isSuccess: boolean;
    /** Reset `status`, `data`, and `error` back to their initial values. Stable. */
    readonly reset: () => void;
    /**
     * Invoke the wrapped function. Stable reference.
     *
     * Calling `send` while a previous call is in flight aborts the prior
     * call: its `await` rejects with an `AbortError`, and its outcome is
     * never written to state. The hook's reactive state tracks the newest
     * call — so in the common case, fire-and-forget (`send(...)` with no
     * await, read `status` / `data` / `error` from render) needs no
     * AbortError handling at all. Callers that do `await send(...)` should
     * filter with {@link isAbortError} to skip the stale branch — see the
     * examples on {@link useAction}.
     */
    readonly send: (...args: TArgs) => Promise<TResult>;
    /**
     * The current lifecycle status as a discriminated string. Matches the
     * shape used by TanStack Query / SWR mutations. The `isIdle`/`isRunning`/
     * `isSuccess`/`isError` booleans are derived from this — pick whichever
     * reads better at the call site.
     */
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
 * stable `send` function plus reactive state. The common case is
 * fire-and-forget: call `send(...)` from an event handler, render from
 * `status` / `data` / `error`. No `await`, no AbortError handling.
 *
 * This is the building block behind {@link useSendTransaction} and is exported
 * for custom async flows (sign-then-send, partial signing, external submission
 * endpoints).
 *
 * @typeParam TArgs - The argument tuple accepted by the wrapped function.
 * @typeParam TResult - The resolved value type of the wrapped function.
 * @param fn - The async function to wrap. Receives an `AbortSignal` followed
 *   by the user-supplied args. The wrapped function does not need to be
 *   memoized — an internal ref keeps `send` stable while always calling the
 *   latest closure, so capturing fresh values from render (e.g. `client`) is
 *   safe.
 * @returns Reactive state and controls ({@link ActionState}).
 *
 * @example Fire-and-forget — read state from render
 * ```tsx
 * const { send, isRunning, error } = useAction((signal, query: string) =>
 *     fetch(`/api/search?q=${query}`, { signal }).then(r => r.json()),
 * );
 *
 * return (
 *     <form onSubmit={e => { e.preventDefault(); send(query); }}>
 *         <input value={query} onChange={…} />
 *         {isRunning && <Spinner />}
 *         {error && <span>{String(error)}</span>}
 *     </form>
 * );
 * ```
 *
 * @example Ignoring the signal
 * ```tsx
 * const { send } = useAction((_signal, to: Address, amount: Lamports) =>
 *     client.sendTransaction(getTransferInstruction({ source, destination: to, amount })),
 * );
 * ```
 *
 * ### Abort semantics
 *
 * Every call to `send` creates a fresh `AbortController`. If `send` is
 * called again (or `reset()` runs) before the in-flight call resolves, the
 * prior controller is aborted: its `await` rejects with an `AbortError`,
 * and its outcome is never written to state. The signal is passed as the
 * *first argument* to the wrapped function — threading it into your
 * `fetch` / RPC / plugin options provides true cancellation of the
 * underlying work.
 *
 * Fire-and-forget callers don't need to do anything here — the reactive
 * state tracks the newest call and the superseded promise rejection is
 * never observed. Only flows that `await send(...)` to branch on the
 * resolved value need the filter:
 *
 * @example Detecting supersede (advanced)
 * ```tsx
 * async function onSubmit(query: string) {
 *     try {
 *         const result = await send(query);
 *         navigate(`/results/${result.id}`);
 *     } catch (err) {
 *         if (isAbortError(err)) return; // superseded — state reflects the newer call
 *         toast.error(String(err));
 *     }
 * }
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
        () => ({
            data: state.data,
            error: state.error,
            isError: state.status === 'error',
            isIdle: state.status === 'idle',
            isRunning: state.status === 'running',
            isSuccess: state.status === 'success',
            reset,
            send,
            status: state.status,
        }),
        [state, reset, send],
    );
}
