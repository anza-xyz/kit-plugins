import type { PendingRpcRequest, PendingRpcSubscriptionsRequest, SolanaRpcResponse } from '@solana/kit';
import { createReactiveStoreWithInitialValueAndSlotTracking } from '@solana/kit';
import type { DependencyList } from 'react';

import { liftToStreamStore } from '../internal/lift-to-stream-store';
import { type LiveQueryResult, useLiveQueryResult } from '../internal/live-query-result';
import { disabledLiveStore, nullLiveStore, useLiveStore } from '../internal/live-store';
import type { ReactiveStreamStore } from '../kit-prereqs';

/**
 * Cache-library-agnostic spec for an RPC + subscription paired data source.
 *
 * Consumed by {@link useLiveData} and (in the adapter packages) by the
 * cache-library bridges. Plugin authors ship
 * `create<Feature>LiveData(client, ...args)` builders returning this
 * shape so the same data definition works with core, SWR, and TanStack.
 *
 * @typeParam T - The unified value type stored and emitted by the live query.
 * @typeParam TRpcValue - The raw value returned by the RPC fetch. Defaults
 *                        to `unknown` when the mapper does the typing.
 * @typeParam TSubscriptionValue - The raw value emitted by the subscription.
 *                                  Defaults to `unknown`.
 */
export type LiveDataSpec<T, TRpcValue = unknown, TSubscriptionValue = unknown> = Readonly<{
    /** Pending RPC request used to seed the store with an initial value. */
    rpcRequest: PendingRpcRequest<SolanaRpcResponse<TRpcValue>>;
    /** Pending subscription request used to keep the store up to date. */
    rpcSubscriptionRequest: PendingRpcSubscriptionsRequest<SolanaRpcResponse<TSubscriptionValue>>;
    /** Maps a subscription notification's value to the unified `T`. */
    rpcSubscriptionValueMapper: (value: TSubscriptionValue) => T;
    /** Maps the RPC response's value to the unified `T`. */
    rpcValueMapper: (value: TRpcValue) => T;
}>;

/**
 * Identity helper that constructs a {@link LiveDataSpec} with `TRpcValue`
 * and `TSubscriptionValue` inferred from the provided RPC and
 * subscription requests.
 *
 * Prefer this over the bare object literal when writing a
 * `create<Feature>LiveData` builder: inline mapper parameters get typed
 * from the actual RPC / subscription return types, instead of falling
 * back to `unknown` when `LiveDataSpec<T>` is used with defaulted
 * generics.
 *
 * @typeParam TRpcValue - Inferred from `rpcRequest`.
 * @typeParam TSubscriptionValue - Inferred from `rpcSubscriptionRequest`.
 * @typeParam T - Inferred from the mapper return types.
 * @param spec - The live-data spec.
 * @return The same spec, with all three generics threaded through.
 *
 * @example
 * ```ts
 * export function createBalanceLiveData(client: BalanceClient, address: Address) {
 *     return createLiveDataSpec({
 *         rpcRequest: client.rpc.getBalance(address),
 *         rpcSubscriptionRequest: client.rpcSubscriptions.accountNotifications(address),
 *         rpcValueMapper: (value) => value,                       // value: Lamports
 *         rpcSubscriptionValueMapper: ({ lamports }) => lamports, // typed from notification
 *     });
 * }
 * ```
 */
export function createLiveDataSpec<TRpcValue, TSubscriptionValue, T>(
    spec: LiveDataSpec<T, TRpcValue, TSubscriptionValue>,
): LiveDataSpec<T, TRpcValue, TSubscriptionValue> {
    return spec;
}

/**
 * Generic live-data hook for any RPC + subscription pair not covered by
 * a named hook.
 *
 * Handles store creation, slot-based dedup, abort, and cleanup. Return
 * `null` from `buildSpec` to disable the query.
 *
 * @typeParam T - The unified value type returned as `data`.
 * @typeParam TRpcValue - The raw RPC value type. Defaults to `unknown`.
 * @typeParam TSubscriptionValue - The raw subscription value type. Defaults
 *                                  to `unknown`.
 * @param buildSpec - Factory returning a {@link LiveDataSpec}, or `null`
 *                    to disable. Runs when `deps` change.
 * @param deps - Dependency list matching React's hook-dep conventions.
 * @return A {@link LiveQueryResult} carrying the current value, status,
 *         error, slot, and a `retry` affordance.
 *
 * @example
 * ```tsx
 * const { data } = useLiveData(
 *     () => ({
 *         rpcRequest: client.rpc.getAccountInfo(gameAddress),
 *         rpcSubscriptionRequest: client.rpcSubscriptions.accountNotifications(gameAddress),
 *         rpcValueMapper: (v) => parseGameState(v.value),
 *         rpcSubscriptionValueMapper: (v) => parseGameState(v),
 *     }),
 *     [client, gameAddress],
 * );
 * ```
 *
 * @see {@link LiveDataSpec}
 * @see {@link useSubscription}
 */
export function useLiveData<T, TRpcValue = unknown, TSubscriptionValue = unknown>(
    buildSpec: () => LiveDataSpec<T, TRpcValue, TSubscriptionValue> | null,
    deps: DependencyList,
): LiveQueryResult<T> {
    const store = useLiveStore<ReactiveStreamStore<SolanaRpcResponse<T>>>(
        signal => {
            const spec = buildSpec();
            if (spec === null) return disabledLiveStore();
            const inner = createReactiveStoreWithInitialValueAndSlotTracking<TRpcValue, TSubscriptionValue, T>({
                abortSignal: signal,
                rpcRequest: spec.rpcRequest,
                rpcSubscriptionRequest: spec.rpcSubscriptionRequest,
                rpcSubscriptionValueMapper: spec.rpcSubscriptionValueMapper,
                rpcValueMapper: spec.rpcValueMapper,
            });
            return liftToStreamStore(inner);
        },
        () => nullLiveStore<SolanaRpcResponse<T>>(),
        deps,
    );
    return useLiveQueryResult(store);
}
