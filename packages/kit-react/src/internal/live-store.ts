import { type DependencyList, useEffect, useMemo, useRef } from 'react';

import type { ReactiveStreamState, ReactiveStreamStore } from '../kit-prereqs';
import { IS_LIVE_CLIENT } from './ssr';

/**
 * Sentinel symbol marking a store as "intentionally off" (the null-gate
 * pattern used by `useBalance(null)`, `useAccount(null)`, etc.). The
 * bridges ({@link useLiveQueryResult}, {@link useSubscriptionResult}) detect
 * the tag and report `status: 'disabled'` instead of `'loading'`.
 *
 * @internal
 */
export const DISABLED = Symbol('DisabledLiveStore');

/** @internal */
export const NOOP_RETRY = () => {};
/** @internal */
export const NOOP_UNSUBSCRIBE = () => {};

const LOADING_STATE: ReactiveStreamState<never> = Object.freeze({
    data: undefined,
    error: undefined,
    status: 'loading',
});

/**
 * Static store that never emits. Bridges surface its `loading` status so
 * SSR matches the first client render. The real store kicks in on the
 * client once `useLiveStore` re-runs its factory.
 *
 * @internal
 */
export function nullLiveStore<T>(): ReactiveStreamStore<T> {
    return {
        getError: () => undefined,
        getState: () => undefined,
        getUnifiedState: () => LOADING_STATE,
        retry: NOOP_RETRY,
        subscribe: () => NOOP_UNSUBSCRIBE,
    };
}

/**
 * Static store tagged as "disabled". Bridges map the tag to
 * `status: 'disabled'` — the `null`-arg story for `useBalance` etc.
 *
 * @internal
 */
export function disabledLiveStore<T>(): ReactiveStreamStore<T> & { readonly [DISABLED]: true } {
    return {
        [DISABLED]: true,
        getError: () => undefined,
        getState: () => undefined,
        getUnifiedState: () => LOADING_STATE,
        retry: NOOP_RETRY,
        subscribe: () => NOOP_UNSUBSCRIBE,
    };
}

/**
 * Returns `true` if a store was produced by {@link disabledLiveStore}.
 *
 * @internal
 */
export function isDisabledStore(store: object): boolean {
    return (store as { [DISABLED]?: boolean })[DISABLED] === true;
}

/**
 * Manages the lifecycle of a reactive store: builds it on mount or when
 * `deps` change, aborts the previous controller on rebuild, and aborts on
 * unmount. On non-live targets (server builds), returns a permanently
 * loading static store so SSR matches the first client render.
 *
 * @internal
 */
export function useLiveStore<TStore extends { subscribe: (cb: () => void) => () => void }>(
    factory: (signal: AbortSignal) => TStore,
    ssrFallback: () => TStore,
    deps: DependencyList,
): TStore {
    const abortRef = useRef<AbortController | null>(null);
    const store = useMemo<TStore>(() => {
        if (!IS_LIVE_CLIENT) return ssrFallback();
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        return factory(controller.signal);
        // Caller-supplied dep list — factory / ssrFallback stability is the caller's responsibility.
    }, deps);
    useEffect(() => () => abortRef.current?.abort(), []);
    return store;
}
