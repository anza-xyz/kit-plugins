import type { PendingRpcSubscriptionsRequest } from '@solana/kit';
import { type DependencyList } from 'react';
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
export declare function useSubscription<T>(factory: (signal: AbortSignal) => PendingRpcSubscriptionsRequest<T>, deps: DependencyList): UseSubscriptionResult<T>;
//# sourceMappingURL=use-subscription.d.ts.map