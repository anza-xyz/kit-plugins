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
 * Return `null` from the factory to disable the subscription — matching the
 * {@link useBalance} / {@link useAccount} / {@link useTransactionConfirmation}
 * `null`-gate convention. A disabled subscription leaves `data` and `error`
 * as `undefined` without subscribing or firing any RPC traffic.
 *
 * @example
 * ```tsx
 * const { data: slot } = useSubscription(
 *     () => client.rpcSubscriptions.slotNotifications(),
 *     [client],
 * );
 * ```
 *
 * @example Gated on a feature flag
 * ```tsx
 * const { data: logs } = useSubscription(
 *     () => (enabled ? client.rpcSubscriptions.logsNotifications(programId) : null),
 *     [client, programId, enabled],
 * );
 * ```
 */
export function useSubscription<T>(
    factory: (signal: AbortSignal) => PendingRpcSubscriptionsRequest<T> | null,
    deps: DependencyList,
): UseSubscriptionResult<T> {
    const [data, setData] = useState<T | undefined>(undefined);
    const [error, setError] = useState<unknown>(undefined);

    useEffect(() => {
        const controller = new AbortController();
        setData(undefined);
        setError(undefined);

        const request = factory(controller.signal);
        if (request === null) {
            // Disabled by caller — no subscription, no traffic.
            return () => controller.abort();
        }

        void (async () => {
            try {
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
        // eslint-disable-next-line react-hooks/exhaustive-deps -- library passthrough: `factory` is caller-controlled; deps list is the contract.
    }, deps);

    return { data, error };
}
