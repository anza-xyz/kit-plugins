import * as React from 'react';

/**
 * Caller-shaped view of the internal state we track per pending promise.
 * A `WeakMap` keyed on the promise itself means callers must pass the same
 * reference across renders (typically via `useMemo` or a module-scope
 * hoist), otherwise each render allocates a new pending state and
 * Suspense never settles.
 */
type PromiseState<T> =
    | { reason: unknown; status: 'rejected' }
    | { status: 'fulfilled'; value: T }
    | { status: 'pending' };

const cache = new WeakMap<Promise<unknown>, PromiseState<unknown>>();

/**
 * React 18 shim for `use(promise)`: throws the promise while pending so a
 * `<Suspense>` boundary catches it, returns the resolved value once
 * fulfilled, re-throws the rejection once rejected. Per-promise state is
 * memoized via a `WeakMap` keyed on promise identity.
 *
 * Exported solely for unit tests — consumers should call {@link usePromise}.
 *
 * @internal
 */
export function shimUsePromise<T>(promise: Promise<T>): T {
    let state = cache.get(promise) as PromiseState<T> | undefined;
    if (!state) {
        state = { status: 'pending' };
        cache.set(promise, state as PromiseState<unknown>);
        promise.then(
            value => {
                cache.set(promise, { status: 'fulfilled', value });
            },
            reason => {
                cache.set(promise, { reason, status: 'rejected' });
            },
        );
    }
    // Throwing the promise itself is Suspense's wire protocol — React attaches
    // its own `.then` to retry render once the promise settles. Not an Error.
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    if (state.status === 'pending') throw promise;
    if (state.status === 'rejected') throw state.reason;
    return state.value;
}

/**
 * Unwraps a promise at render time, surfacing the pending state to the
 * nearest `<Suspense>` boundary via a thrown promise.
 *
 * Uses React 19's native `use(promise)` when available, falls back to a
 * tiny shim under React 18 that follows the same thrown-promise contract.
 * The promise must be stable across renders — pass a `useMemo`'d or
 * module-scope promise, never an inline `new Promise(...)`.
 *
 * @typeParam T - The resolved value type.
 * @param promise - A stable-reference promise.
 * @return The resolved value once fulfilled.
 * @throws The promise itself while pending; the rejection reason once rejected.
 *
 * @internal
 */
export const usePromise: <T>(promise: Promise<T>) => T =
    'use' in React && typeof (React as { use?: unknown }).use === 'function'
        ? ((React as unknown as { use: <T>(p: Promise<T>) => T }).use as <T>(p: Promise<T>) => T)
        : shimUsePromise;
