import { useMemo, useSyncExternalStore } from 'react';

import type { ReactiveActionState, ReactiveActionStore } from '../kit-prereqs';

/**
 * Tag used by {@link disabledActionStore} so {@link useRequestResult} can
 * map its presence to `status: 'disabled'`.
 *
 * @internal
 */
export const DISABLED_ACTION = Symbol('DisabledActionStore');

const DISABLED_STATE: ReactiveActionState<never> = Object.freeze({
    data: undefined,
    error: undefined,
    status: 'idle',
});

/**
 * Static action store used when `useRequest`'s factory returns `null`.
 * Parallels `disabledLiveStore` for the stream-store side. `getState`
 * returns a frozen module-scope snapshot so `useSyncExternalStore` sees a
 * stable reference across renders.
 *
 * @internal
 */
export function disabledActionStore<T>(): ReactiveActionStore<[], T> & { readonly [DISABLED_ACTION]: true } {
    return {
        [DISABLED_ACTION]: true,
        dispatch: () => {},
        dispatchAsync: () => new Promise<T>(() => {}),
        getState: () => DISABLED_STATE as ReactiveActionState<T>,
        reset: () => {},
        subscribe: () => () => {},
    };
}

/** State returned by {@link useRequest}. */
export type RequestResult<T> = {
    data: T | undefined;
    error: unknown;
    /** Convenience shorthand for `status === 'loading'`. */
    isLoading: boolean;
    /** Re-fire the request with the current deps. Stable reference. */
    refresh: () => void;
    status: 'disabled' | 'error' | 'loaded' | 'loading' | 'retrying';
};

const NOOP_REFRESH = () => {};

/**
 * Bridge for `useRequest`. Maps action-store states
 * `{ idle, running, success, error }` onto the read shape
 * `{ loading, loaded, error, retrying, disabled }`.
 *
 * @internal
 */
export function useRequestResult<T>(store: ReactiveActionStore<[], T>): RequestResult<T> {
    const snapshot = useSyncExternalStore(store.subscribe, store.getState, store.getState);
    const disabled = (store as { [DISABLED_ACTION]?: boolean })[DISABLED_ACTION] === true;
    return useMemo(() => {
        if (disabled) {
            return {
                data: undefined,
                error: undefined,
                isLoading: false,
                refresh: NOOP_REFRESH,
                status: 'disabled',
            };
        }
        const hadPrior = snapshot.data !== undefined;
        let status: RequestResult<T>['status'];
        switch (snapshot.status) {
            case 'idle':
                // `.reactiveStore()` auto-dispatches, so `idle` never reaches
                // consumers. Map to `loading` as a defensive fallback.
                status = 'loading';
                break;
            case 'running':
                status = hadPrior ? 'retrying' : 'loading';
                break;
            case 'success':
                status = 'loaded';
                break;
            case 'error':
                status = 'error';
                break;
        }
        return {
            data: snapshot.data,
            error: snapshot.error,
            isLoading: status === 'loading',
            refresh: store.dispatch,
            status,
        };
    }, [snapshot, disabled, store]);
}
