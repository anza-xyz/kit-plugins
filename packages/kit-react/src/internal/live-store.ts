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

/**
 * @internal
 * Returns a static store that never emits. Used to keep the hook mounted
 * (and its hook-call order stable) when a query is disabled via `null`
 * arguments.
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
 * Manages the lifecycle of a {@link ReactiveStore}: builds a store inside a
 * `useMemo` keyed on `deps`, aborts + rebuilds when deps change, and aborts
 * on unmount. The factory receives a fresh `AbortSignal` on each rebuild.
 */
export function useLiveStore<TStore extends ReactiveStore<unknown>>(
    factory: (signal: AbortSignal) => TStore,
    deps: DependencyList,
): TStore {
    const controllerRef = useRef<AbortController | null>(null);

    const store = useMemo(() => {
        controllerRef.current?.abort();
        const controller = new AbortController();
        controllerRef.current = controller;
        return factory(controller.signal);
    }, deps);

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
    return useMemo(
        () => ({
            data: state?.value,
            error,
            isLoading: state === undefined && error === undefined,
        }),
        [state, error],
    );
}
