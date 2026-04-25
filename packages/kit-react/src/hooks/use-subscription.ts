import type { PendingRpcSubscriptionsRequest } from '@solana/kit';
import type { DependencyList } from 'react';

import type { LiveQueryResult } from '../internal/live-query-result';
import { disabledLiveStore, nullLiveStore, useLiveStore } from '../internal/live-store';
import { type UnwrapRpcResponse, useSubscriptionResult } from '../internal/subscription-result';
import { reactiveStoreFromPendingSubscriptionsRequest, type ReactiveStreamStore } from '../kit-prereqs';

/**
 * Anything that produces a `ReactiveStreamStore<T>` via
 * `.reactiveStore({ abortSignal })`, or a `PendingRpcSubscriptionsRequest<T>`
 * that the hook wraps internally.
 *
 * Accepting both shapes means
 * `useSubscription(() => client.rpcSubscriptions.slotNotifications())`
 * works today — `PendingRpcSubscriptionsRequest<T>` is adapted via an
 * internal shim (see `kit-prereqs/pending-rpc-subs-request.ts`).
 * Plugin-authored streaming objects that already expose `.reactiveStore()`
 * plug in without wrapping. Once Kit ships a native sync
 * `.reactiveStore()` on `PendingRpcSubscriptionsRequest`, the union
 * collapses to the second branch — the general
 * `{ reactiveStore({ abortSignal }) }` shape that any source (Kit,
 * plugin-authored, or user-built) satisfies.
 *
 * @typeParam T - The notification value type emitted by the stream.
 */
export type ReactiveStreamSource<T> =
    | PendingRpcSubscriptionsRequest<T>
    | {
          reactiveStore(options: { abortSignal: AbortSignal }): ReactiveStreamStore<T>;
      };

/**
 * Subscribes to a stream and surfaces the latest notification in the same
 * `LiveQueryResult` shape as the named hooks.
 *
 * Accepts any object with `.reactiveStore({ abortSignal })` (typically a
 * `PendingRpcSubscriptionsRequest`). Return `null` from `factory` to
 * disable: no RPC traffic fires, and `status` reports `'disabled'`.
 * Subscriptions that emit `SolanaRpcResponse<U>`-shaped notifications
 * (account, program, signature) are unwrapped so `data` is the inner
 * value and `slot` is populated. Raw-value subscriptions pass through
 * with `slot: undefined`.
 *
 * @typeParam T - The notification value type emitted by the source.
 * @param factory - Factory returning a {@link ReactiveStreamSource}, or
 *                  `null` to disable. Runs when `deps` change.
 * @param deps - Dependency list matching React's hook-dep conventions.
 * @return A {@link LiveQueryResult} whose `data` is `T` unwrapped of any
 *         `SolanaRpcResponse` envelope.
 *
 * @example
 * ```tsx
 * const { data: slot, error, retry } = useSubscription(
 *     () => client.rpcSubscriptions.slotNotifications(),
 *     [client],
 * );
 * ```
 *
 * @see {@link useLiveData}
 */
export function useSubscription<T>(
    factory: (signal: AbortSignal) => ReactiveStreamSource<T> | null,
    deps: DependencyList,
): LiveQueryResult<UnwrapRpcResponse<T>> {
    const store = useLiveStore<ReactiveStreamStore<T>>(
        signal => {
            const pending = factory(signal);
            if (pending === null) return disabledLiveStore<T>();
            // TODO(kit#1553): once Kit ships a sync `.reactiveStore()` on
            // `PendingRpcSubscriptionsRequest`, collapse this branch.
            if ('reactiveStore' in pending) return pending.reactiveStore({ abortSignal: signal });
            return reactiveStoreFromPendingSubscriptionsRequest(pending, { abortSignal: signal });
        },
        () => nullLiveStore<T>(),
        deps,
    );
    return useSubscriptionResult(store);
}
