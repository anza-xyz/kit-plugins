import type { SolanaRpcResponse } from '@solana/kit';
import { type DependencyList, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

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

const NULL_SUBSCRIBE: ReactiveStore<never>['subscribe'] = () => () => {};
const NULL_GET: () => undefined = () => undefined;

/** @internal Branded property tagging a disabled (null-arg) live store. */
const DISABLED = Symbol('DisabledLiveStore');

type DisabledLiveStore<TItem> = LiveStore<TItem> & { readonly [DISABLED]: true };

/**
 * @internal
 * Returns a static store that never emits. Used by {@link useLiveStore} on
 * server builds to keep render deterministic without firing RPC / WebSocket
 * traffic. Reports as `isLoading: true` so components render their loading
 * state on the server and hydrate cleanly (the first client render is also
 * loading, then the real store kicks in).
 */
export function nullLiveStore<TItem>(): LiveStore<TItem> {
    return {
        getError: NULL_GET,
        getState: NULL_GET,
        subscribe: NULL_SUBSCRIBE,
    } as unknown as LiveStore<TItem>;
}

/**
 * @internal
 * Returns a static store tagged as "disabled". Used by named hooks
 * (`useBalance`, `useAccount`, …) when the address / signature argument is
 * `null`. {@link useLiveQueryResult} detects the tag and reports
 * `isLoading: false` so disabled queries don't render a forever-loading UI —
 * matching react-query / SWR semantics when the key is `null`.
 */
export function disabledLiveStore<TItem>(): LiveStore<TItem> {
    return {
        [DISABLED]: true,
        getError: NULL_GET,
        getState: NULL_GET,
        subscribe: NULL_SUBSCRIBE,
    } as unknown as DisabledLiveStore<TItem>;
}

/** @internal `true` if the store is a disabled-query stand-in. */
function isDisabledLiveStore(store: ReactiveStore<unknown>): boolean {
    return (store as Partial<DisabledLiveStore<unknown>>)[DISABLED] === true;
}

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
export function useLiveStore<TStore extends ReactiveStore<unknown>>(
    factory: (signal: AbortSignal) => TStore,
    deps: DependencyList,
): TStore {
    const controllerRef = useRef<AbortController | null>(null);

    // The SSR branch lives INSIDE the memo (rather than as an early return
    // above the hooks) so the hook sequence stays identical between server
    // and client — keeps `react-hooks/rules-of-hooks` happy and makes the
    // build-time dead-code-elimination a pure simplification rather than a
    // correctness load-bearer.
    const store = useMemo(
        () => {
            if (!__BROWSER__ && !__REACTNATIVE__) {
                return nullLiveStore<unknown>() as TStore;
            }
            controllerRef.current?.abort();
            const controller = new AbortController();
            controllerRef.current = controller;
            return factory(controller.signal);
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps -- library passthrough: `factory` is caller-controlled; deps list is the contract.
        deps,
    );

    useEffect(
        () => () => {
            controllerRef.current?.abort();
            controllerRef.current = null;
        },
        [],
    );

    return store;
}

/**
 * @internal
 * Bridges a {@link ReactiveStore} (as produced by
 * `createReactiveStoreWithInitialValueAndSlotTracking`) to React via
 * `useSyncExternalStore`, returning a {@link LiveQueryResult} with
 * `data`/`error`/`isLoading`.
 */
export function useLiveQueryResult<T>(store: LiveStore<T>): LiveQueryResult<T> {
    const subscribe = (listener: () => void) => store.subscribe(listener);
    const getState = () => store.getState() as SolanaRpcResponse<T> | undefined;
    const getError = () => store.getError();
    const state = useSyncExternalStore(subscribe, getState, getState);
    const error = useSyncExternalStore(subscribe, getError, getError);
    // A disabled store never fetches or emits — report `isLoading: false` so
    // consumers don't show a loading UI for "query intentionally off". Matches
    // react-query / SWR semantics when the key is `null`.
    const disabled = isDisabledLiveStore(store);
    return useMemo(
        () => ({
            data: state?.value,
            error,
            isLoading: !disabled && state === undefined && error === undefined,
        }),
        [state, error, disabled],
    );
}
