import type { Slot, SolanaRpcResponse } from '@solana/kit';
import { useMemo, useSyncExternalStore } from 'react';

import type { ReactiveStreamState, ReactiveStreamStore } from '../kit-prereqs';
import { isDisabledStore, NOOP_RETRY } from './live-store';

/**
 * Shape returned by the named live-data hooks and by
 * {@link useLiveData}. Reactive, read-only snapshot drawn from the
 * underlying {@link ReactiveStreamStore}.
 */
export type LiveQueryResult<T> = {
    /**
     * The current value. `undefined` while loading or when disabled. On
     * `error` and `retrying` holds the last known value (if any) so UIs
     * can show stale data with an overlay rather than flashing to blank.
     */
    data: T | undefined;
    /** Error from the fetch or subscription, or `undefined`. */
    error: unknown;
    /**
     * Convenience shorthand for `status === 'loading'`. A disabled query
     * reports `false`, matching react-query / SWR semantics when the key
     * is `null`. `retrying` also reports `false` because `data` still
     * holds the last known value.
     */
    isLoading: boolean;
    /** Re-open the stream after an error. Stable reference. */
    retry: () => void;
    /**
     * The slot `data` was observed at. `undefined` while loading, when
     * disabled, on server render, or when only an error has arrived.
     */
    slot: Slot | undefined;
    /** Lifecycle status drawn from `ReactiveStreamStore` plus a `'disabled'` kit-react variant. */
    status: 'disabled' | 'error' | 'loaded' | 'loading' | 'retrying';
};

/**
 * Bridge for named hooks whose stores come from
 * `createReactiveStoreWithInitialValueAndSlotTracking` — `data` is a
 * `SolanaRpcResponse<T>` envelope (value + slot context).
 *
 * @internal
 */
export function useLiveQueryResult<T>(store: ReactiveStreamStore<SolanaRpcResponse<T>>): LiveQueryResult<T> {
    const state: ReactiveStreamState<SolanaRpcResponse<T>> = useSyncExternalStore(
        store.subscribe,
        store.getUnifiedState,
        store.getUnifiedState,
    );
    const disabled = isDisabledStore(store);
    return useMemo(() => {
        if (disabled) {
            return {
                data: undefined,
                error: undefined,
                isLoading: false,
                retry: NOOP_RETRY,
                slot: undefined,
                status: 'disabled',
            };
        }
        return {
            data: state.data?.value,
            error: state.error,
            isLoading: state.status === 'loading',
            retry: store.retry,
            slot: state.data?.context.slot,
            status: state.status,
        };
    }, [state, disabled, store]);
}
