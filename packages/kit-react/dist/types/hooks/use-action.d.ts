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
export declare function useAction<TArgs extends unknown[], TResult>(fn: (signal: AbortSignal, ...args: TArgs) => Promise<TResult>): ActionState<TArgs, TResult>;
//# sourceMappingURL=use-action.d.ts.map