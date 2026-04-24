import type { DependencyList } from 'react';

import type { LiveQueryResult } from '../internal/live-query-result';
import { disabledLiveStore, nullLiveStore, useLiveStore } from '../internal/live-store';
import { type UnwrapRpcResponse, useSubscriptionResult } from '../internal/subscription-result';
import type { ReactiveStreamStore } from '../kit-prereqs';

/**
 * Anything that produces a `ReactiveStreamStore<T>` via
 * `.reactiveStore({ abortSignal })`.
 *
 * `PendingRpcSubscriptionsRequest<T>` satisfies this by design;
 * plugin-authored streaming objects that follow the same convention plug
 * in without modification.
 *
 * @typeParam T - The notification value type emitted by the stream.
 */
export type ReactiveStreamSource<T> = {
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
            return pending.reactiveStore({ abortSignal: signal });
        },
        () => nullLiveStore<T>(),
        deps,
    );
    return useSubscriptionResult(store);
}
