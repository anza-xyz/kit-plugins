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
 * Returns a static store that never emits. Used by {@link useLiveStore} on
 * server builds to keep render deterministic without firing RPC / WebSocket
 * traffic. Reports as `isLoading: true` so components render their loading
 * state on the server and hydrate cleanly (the first client render is also
 * loading, then the real store kicks in).
 */
export declare function nullLiveStore<TItem>(): LiveStore<TItem>;
/**
 * @internal
 * Returns a static store tagged as "disabled". Used by named hooks
 * (`useBalance`, `useAccount`, …) when the address / signature argument is
 * `null`. {@link useLiveQueryResult} detects the tag and reports
 * `isLoading: false` so disabled queries don't render a forever-loading UI —
 * matching react-query / SWR semantics when the key is `null`.
 */
export declare function disabledLiveStore<TItem>(): LiveStore<TItem>;
/**
 * @internal
 * Manages the lifecycle of a {@link ReactiveStore}: builds a store inside a
 * `useMemo` keyed on `deps`, aborts + rebuilds when deps change, and aborts
 * on unmount. The factory receives a fresh `AbortSignal` on each rebuild.
 *
 * **SSR-safe.** On server-only builds (`!__BROWSER__ && !__REACTNATIVE__`) the
 * factory is never invoked — we return a stable {@link nullLiveStore} instead.
 * Downstream hooks therefore render as `{ data: undefined, isLoading: true }`
 * during server render with zero RPC or subscription traffic, and hydrate
 * cleanly because the first client snapshot matches. On the client, the real
 * store kicks in and starts fetching / subscribing.
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