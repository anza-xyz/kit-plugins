/**
 * TODO(move-to-kit): Replace these types with the canonical versions once
 * https://github.com/anza-xyz/kit/pull/1552 lands. The upstream PR renames
 * `ReactiveStore` to `ReactiveStreamStore`, adds `retry()` + a unified
 * `{ status, data, error }` snapshot via `getUnifiedState()`, and extends
 * `createReactiveStoreWithInitialValueAndSlotTracking` to return the new
 * shape. When the PR is released, delete this file and re-export the shape
 * from `@solana/kit` directly.
 */

/**
 * Lifecycle of a {@link ReactiveStreamStore}.
 *
 * - `loading`: no data has arrived yet.
 * - `loaded`: the most recent update was successful.
 * - `error`: the stream errored and no live connection is active.
 * - `retrying`: a caller invoked {@link ReactiveStreamStore.retry} after an
 *   error; the stream is trying to re-establish. `data` continues to hold
 *   the last known value (if any) during this phase.
 */
export type ReactiveStreamStatus = 'error' | 'loaded' | 'loading' | 'retrying';

/**
 * A snapshot of a {@link ReactiveStreamStore}'s state.
 *
 * The three fields are mutually consistent with `status`: `loaded` implies
 * `data` is the latest value and `error` is undefined; `error` implies
 * `error` is set; `loading` implies `data` is undefined (modulo the initial
 * pre-emit state); `retrying` preserves the stale `data` from before the
 * error so UIs can render a stale value with a retry overlay.
 *
 * @typeParam T - The value type emitted onto the store.
 */
export type ReactiveStreamState<T> = Readonly<{
    /** The most recent value, or `undefined` before the first emit. */
    data: T | undefined;
    /** The most recent error, or `undefined` when healthy. */
    error: unknown;
    /** Current lifecycle status. */
    status: ReactiveStreamStatus;
}>;

/**
 * Reactive container for long-lived stream-shaped data (RPC subscriptions,
 * RPC-fetch-plus-subscription hybrids). Compatible with
 * `useSyncExternalStore` via {@link ReactiveStreamStore.subscribe} +
 * {@link ReactiveStreamStore.getUnifiedState}.
 *
 * The asymmetric accessor surface (`getState` deprecated, `getUnifiedState`
 * preferred) is intentional while Kit ships the rename; see the spec's
 * "Prerequisites" section.
 *
 * @typeParam T - Value type emitted onto the store.
 */
export type ReactiveStreamStore<T> = {
    /**
     * Returns the last error emitted on the stream, or `undefined` when
     * healthy. Once set, the error is preserved across subsequent
     * notifications until a fresh value arrives.
     */
    getError: (this: void) => unknown;
    /**
     * Returns the most recent value emitted on the stream, or `undefined`
     * before the first emit.
     */
    getState: (this: void) => T | undefined;
    /**
     * The full `{ status, data, error }` snapshot. Reference-stable per
     * update so that `useSyncExternalStore` can detect changes cheaply.
     */
    getUnifiedState: (this: void) => ReactiveStreamState<T>;
    /**
     * Re-opens the stream after an error. No-op unless
     * `getUnifiedState().status === 'error'`. While re-establishing, the
     * store transitions through `status: 'retrying'` keeping the last
     * known `data` value, then settles to `loaded` or `error`.
     */
    retry: (this: void) => void;
    /**
     * Registers a listener for state changes. Returns an idempotent
     * unsubscribe function.
     */
    subscribe: (this: void, listener: () => void) => () => void;
};
