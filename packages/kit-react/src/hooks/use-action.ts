import { useCallback, useMemo, useRef, useState } from 'react';

/** Discrete lifecycle status for an async action. */
export type ActionStatus = 'error' | 'idle' | 'sending' | 'success';

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
    /** Invoke the wrapped function. Stable. Rethrows on failure. */
    readonly send: (...args: TArgs) => Promise<TResult>;
    /** The current lifecycle status. */
    readonly status: ActionStatus;
};

type InternalState<TResult> =
    | { data: TResult; error: undefined; status: 'success' }
    | { data: undefined; error: undefined; status: 'idle' | 'sending' }
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
 * This is the building block behind {@link useSendTransaction} and is exported
 * so you can wire up custom async flows (sign-then-send, partial signing,
 * external submission endpoints).
 *
 * @typeParam TArgs - The argument tuple accepted by the wrapped function.
 * @typeParam TResult - The resolved value type of the wrapped function.
 * @param fn - The async function to wrap. A stable reference is preferred;
 *   changes to `fn` update the closure inside the returned `send`.
 * @returns Reactive state and controls ({@link ActionState}).
 *
 * @example
 * ```tsx
 * const client = useClient();
 * const { send, status, error } = useAction(
 *     useCallback((to: Address, amount: Lamports) =>
 *         client.sendTransaction(getTransferInstruction({ source, destination: to, amount })),
 *         [client]),
 * );
 * ```
 */
export function useAction<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => Promise<TResult>,
): ActionState<TArgs, TResult> {
    const [state, setState] = useState<InternalState<TResult>>(IDLE);
    const fnRef = useRef(fn);
    fnRef.current = fn;
    const requestIdRef = useRef(0);

    const send = useCallback(async (...args: TArgs) => {
        const requestId = ++requestIdRef.current;
        setState({ data: undefined, error: undefined, status: 'sending' });
        try {
            const data = await fnRef.current(...args);
            if (requestId === requestIdRef.current) {
                setState({ data, error: undefined, status: 'success' });
            }
            return data;
        } catch (error) {
            if (requestId === requestIdRef.current) {
                setState({ data: undefined, error, status: 'error' });
            }
            throw error;
        }
    }, []);

    const reset = useCallback(() => {
        requestIdRef.current++;
        setState(IDLE);
    }, []);

    return useMemo(
        () => ({ data: state.data, error: state.error, reset, send, status: state.status }),
        [state, reset, send],
    );
}
