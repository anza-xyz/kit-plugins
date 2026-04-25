import type { ReactiveStore } from '@solana/subscribable';

import type { ReactiveStreamState, ReactiveStreamStore } from '../kit-prereqs';

/**
 * Adapts Kit's current `{ subscribe, getState, getError }`
 * {@link ReactiveStore} into a {@link ReactiveStreamStore} by synthesising
 * `getUnifiedState` from `getState` + `getError` and accepting an
 * externally-provided `retry`.
 *
 * This helper is not destined for Kit. When kit#1552 lands,
 * `createReactiveStoreWithInitialValueAndSlotTracking` will return the
 * full {@link ReactiveStreamStore} shape directly; this whole adapter
 * gets deleted at that point.
 *
 * @typeParam T - The value type emitted by the underlying store.
 * @param store - Kit's current stream-shaped reactive store.
 * @param retry - Optional `retry` implementation. Defaults to a no-op
 *                because Kit's current store has no retry affordance;
 *                callers that control the factory can pass their own.
 * @return A {@link ReactiveStreamStore} wrapping the input.
 *
 * @internal
 */
export function liftToStreamStore<T>(store: ReactiveStore<T>, retry: () => void = () => {}): ReactiveStreamStore<T> {
    // Cache the last returned snapshot so repeated reads (as `useSyncExternalStore` does each render)
    // return a reference-equal object when nothing has changed. Without this, React treats every read
    // as a new value and re-renders in a loop.
    let cachedData: T | undefined;
    let cachedError: unknown;
    let cachedState: ReactiveStreamState<T> | undefined;
    const getUnifiedState = (): ReactiveStreamState<T> => {
        const error = store.getError();
        const data = store.getState();
        if (cachedState && cachedData === data && cachedError === error) {
            return cachedState;
        }
        cachedData = data;
        cachedError = error;
        if (error !== undefined) {
            cachedState = { data, error, status: 'error' };
        } else if (data === undefined) {
            cachedState = { data: undefined, error: undefined, status: 'loading' };
        } else {
            cachedState = { data, error: undefined, status: 'loaded' };
        }
        return cachedState;
    };
    return {
        getError: () => store.getError(),
        getState: () => store.getState(),
        getUnifiedState,
        retry,
        subscribe: (listener: () => void) => store.subscribe(listener),
    };
}
