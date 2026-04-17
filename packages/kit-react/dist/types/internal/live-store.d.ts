import type { SolanaRpcResponse } from '@solana/kit';
import { type DependencyList } from 'react';
/**
 * @internal
 * Minimal `ReactiveStore` shape matching `@solana/subscribable`. Inlined to
 * avoid a direct dependency on a transitive package.
 */
export type ReactiveStore<T> = {
    getError(): unknown;
    getState(): T | undefined;
    subscribe(callback: () => void): () => void;
};
/**
 * The shape returned by live-data hooks.
 *
 * @typeParam T - The item type held by the store.
 */
export type LiveQueryResult<T> = {
    /** The latest value, or `undefined` if nothing has arrived yet. */
    readonly data: T | undefined;
    /** The first error from the RPC fetch or subscription, or `undefined`. */
    readonly error: unknown;
    /** `true` when no value and no error have arrived. */
    readonly isLoading: boolean;
};
/**
 * @internal
 * The shape produced by `createReactiveStoreWithInitialValueAndSlotTracking`.
 */
export type LiveStore<TItem> = ReactiveStore<SolanaRpcResponse<TItem>>;
/**
 * @internal
 * Returns a static store that never emits. Used to keep the hook mounted
 * (and its hook-call order stable) when a query is disabled via `null`
 * arguments.
 */
export declare function nullLiveStore<TItem>(): LiveStore<TItem>;
/**
 * @internal
 * Manages the lifecycle of a {@link ReactiveStore}: builds a store inside a
 * `useMemo` keyed on `deps`, aborts + rebuilds when deps change, and aborts
 * on unmount. The factory receives a fresh `AbortSignal` on each rebuild.
 */
export declare function useLiveStore<TStore extends ReactiveStore<unknown>>(factory: (signal: AbortSignal) => TStore, deps: DependencyList): TStore;
/**
 * @internal
 * Bridges a {@link ReactiveStore} (as produced by
 * `createReactiveStoreWithInitialValueAndSlotTracking`) to React via
 * `useSyncExternalStore`, returning a {@link LiveQueryResult} with
 * `data`/`error`/`isLoading`.
 */
export declare function useLiveQueryResult<T>(store: LiveStore<T>): LiveQueryResult<T>;
//# sourceMappingURL=live-store.d.ts.map