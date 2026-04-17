import type { PendingRpcSubscriptionsRequest } from '@solana/kit';
import { type DependencyList, useEffect, useState } from 'react';

/** The state returned by {@link useSubscription}. */
export type UseSubscriptionResult<T> = {
    /** The latest notification value, or `undefined` before any arrive. */
    readonly data: T | undefined;
    /** The first error from the subscription, or `undefined`. */
    readonly error: unknown;
};

/**
 * Subscribe to an RPC subscription that has no corresponding one-shot RPC
 * method (e.g. `slotNotifications`, `logsNotifications`).
 *
 * Returns the latest notification value. For subscriptions that *do* have an
 * RPC counterpart (`getAccountInfo` + `accountNotifications`), prefer
 * {@link useLiveQuery} or a named hook so you get slot-dedup and an initial
 * snapshot.
 *
 * The `factory` is invoked when `deps` change (or on mount) with a fresh
 * {@link AbortSignal} that is triggered on dep change and unmount.
 *
 * @example
 * ```tsx
 * const { data: slot } = useSubscription(
 *     () => client.rpcSubscriptions.slotNotifications(),
 *     [client],
 * );
 * ```
 *
 * @example
 * ```tsx
 * const { data: logs } = useSubscription(
 *     () => client.rpcSubscriptions.logsNotifications(programId),
 *     [client, programId],
 * );
 * ```
 */
export function useSubscription<T>(
    factory: (signal: AbortSignal) => PendingRpcSubscriptionsRequest<T>,
    deps: DependencyList,
): UseSubscriptionResult<T> {
    const [data, setData] = useState<T | undefined>(undefined);
    const [error, setError] = useState<unknown>(undefined);

    useEffect(() => {
        const controller = new AbortController();
        setData(undefined);
        setError(undefined);

        void (async () => {
            try {
                const request = factory(controller.signal);
                const iterable = await request.subscribe({ abortSignal: controller.signal });
                for await (const notification of iterable) {
                    if (controller.signal.aborted) return;
                    setData(notification);
                }
            } catch (e) {
                if (controller.signal.aborted) return;
                setError(e);
            }
        })();

        return () => controller.abort();
    }, deps);

    return { data, error };
}
