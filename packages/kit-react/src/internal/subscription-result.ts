import type { Slot, SolanaRpcResponse } from '@solana/kit';
import { useMemo, useSyncExternalStore } from 'react';

import type { ReactiveStreamState, ReactiveStreamStore } from '../kit-prereqs';
import type { LiveQueryResult } from './live-query-result';
import { isDisabledStore, NOOP_RETRY } from './live-store';

/**
 * Unwraps `SolanaRpcResponse<U>` → `U` at the type level, so subscriptions
 * that emit slot-stamped notifications surface `U` as `data` (the slot
 * moves to the top-level `slot` field). Non-envelope subscriptions pass
 * through unchanged.
 */
export type UnwrapRpcResponse<T> = T extends SolanaRpcResponse<infer U> ? U : T;

/**
 * Runtime duck-type for the `SolanaRpcResponse` envelope. Splits
 * `{ context: { slot }, value }` into `{ data, slot }`; anything else
 * passes through.
 *
 * @internal
 */
export function splitRpcResponse<T>(notification: T | undefined): {
    data: UnwrapRpcResponse<T> | undefined;
    slot: Slot | undefined;
} {
    if (
        notification != null &&
        typeof notification === 'object' &&
        'context' in notification &&
        'value' in notification
    ) {
        const envelope = notification as SolanaRpcResponse<unknown>;
        return {
            data: envelope.value as UnwrapRpcResponse<T>,
            slot: envelope.context.slot,
        };
    }
    return { data: notification as UnwrapRpcResponse<T> | undefined, slot: undefined };
}

/**
 * Bridge for `useSubscription`. The store comes straight from
 * `.reactiveStore()` on a pending subscription — each notification is
 * duck-typed for the `SolanaRpcResponse` envelope.
 *
 * @internal
 */
export function useSubscriptionResult<T>(store: ReactiveStreamStore<T>): LiveQueryResult<UnwrapRpcResponse<T>> {
    const state: ReactiveStreamState<T> = useSyncExternalStore(
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
        const { data, slot } = splitRpcResponse(state.data);
        return {
            data,
            error: state.error,
            isLoading: state.status === 'loading',
            retry: store.retry,
            slot,
            status: state.status,
        };
    }, [state, disabled, store]);
}
