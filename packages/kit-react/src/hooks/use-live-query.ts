import {
    createReactiveStoreWithInitialValueAndSlotTracking,
    type PendingRpcRequest,
    type PendingRpcSubscriptionsRequest,
    type SolanaRpcResponse,
} from '@solana/kit';
import type { DependencyList } from 'react';

import { type LiveQueryResult, type LiveStore, useLiveQueryResult, useLiveStore } from '../internal/live-store';

/**
 * Config for {@link useLiveQuery} — an omission of
 * `CreateReactiveStoreWithInitialValueAndSlotTrackingConfig` that drops
 * `abortSignal` (the hook provides it).
 */
export type UseLiveQueryConfig<TRpcValue, TSubscriptionValue, TItem> = {
    /** A pending RPC request whose response seeds the initial value. */
    readonly rpcRequest: PendingRpcRequest<SolanaRpcResponse<TRpcValue>>;
    /** A pending subscription request whose notifications update the value. */
    readonly rpcSubscriptionRequest: PendingRpcSubscriptionsRequest<SolanaRpcResponse<TSubscriptionValue>>;
    /** Maps a subscription notification's value to the stored item. */
    readonly rpcSubscriptionValueMapper: (value: TSubscriptionValue) => TItem;
    /** Maps the initial RPC response's value to the stored item. */
    readonly rpcValueMapper: (value: TRpcValue) => TItem;
};

/**
 * Generic live query for any RPC + subscription pair.
 *
 * Handles store creation (slot-aware dedup), abort on dep change, and cleanup
 * on unmount. Prefer the named hooks ({@link useBalance}, {@link useAccount},
 * {@link useTransactionConfirmation}) when available — they encode
 * Solana-specific mapping logic. Reach for `useLiveQuery` for custom program
 * accounts or other RPC/subscription pairs the named hooks don't cover.
 *
 * `factory` is called when `deps` change (or on mount) with a fresh
 * {@link AbortSignal} and must return a {@link UseLiveQueryConfig}. Using a
 * function (rather than a plain config object) lets ESLint's
 * `react-hooks/exhaustive-deps` rule trace which values the config closes
 * over and warn when any are missing from `deps`. Add `'useLiveQuery'` to
 * your project's `react-hooks/exhaustive-deps` `additionalHooks` setting to
 * opt in.
 *
 * The `signal` argument is the same `AbortSignal` that gets threaded into the
 * underlying reactive store — it fires on the next dep change and on unmount.
 * Ignore it (`_signal`) if your factory doesn't need it; thread it into
 * auxiliary work (an additional `fetch`, a WASM decoder warmup, etc.) that
 * should be cancelled alongside the store.
 *
 * @example
 * ```tsx
 * const { data: gameState } = useLiveQuery(
 *     _signal => ({
 *         rpcRequest: client.rpc.getAccountInfo(gameAddress, { encoding: 'base64' }),
 *         rpcSubscriptionRequest: client.rpcSubscriptions.accountNotifications(gameAddress, { encoding: 'base64' }),
 *         rpcValueMapper: (v) => (v ? parseGameState(parseBase64RpcAccount(gameAddress, v)) : null),
 *         rpcSubscriptionValueMapper: (v) => (v ? parseGameState(parseBase64RpcAccount(gameAddress, v)) : null),
 *     }),
 *     [client, gameAddress],
 * );
 * ```
 *
 * @example Threading the signal into auxiliary work
 * ```tsx
 * const { data } = useLiveQuery(
 *     signal => {
 *         // Kick off a side-effect that should be cancelled if deps change.
 *         void enrichFromExternalApi(gameAddress, { signal });
 *         return {
 *             rpcRequest: client.rpc.getAccountInfo(gameAddress, { encoding: 'base64' }),
 *             rpcSubscriptionRequest: client.rpcSubscriptions.accountNotifications(gameAddress, { encoding: 'base64' }),
 *             rpcValueMapper: v => (v ? parseGameState(parseBase64RpcAccount(gameAddress, v)) : null),
 *             rpcSubscriptionValueMapper: v => (v ? parseGameState(parseBase64RpcAccount(gameAddress, v)) : null),
 *         };
 *     },
 *     [client, gameAddress],
 * );
 * ```
 */
export function useLiveQuery<TRpcValue, TSubscriptionValue, TItem>(
    factory: (signal: AbortSignal) => UseLiveQueryConfig<TRpcValue, TSubscriptionValue, TItem>,
    deps: DependencyList,
): LiveQueryResult<TItem> {
    const store = useLiveStore<LiveStore<TItem>>(
        signal => createReactiveStoreWithInitialValueAndSlotTracking({ ...factory(signal), abortSignal: signal }),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- library passthrough: `factory` is caller-controlled; deps list is the contract.
        deps,
    );
    return useLiveQueryResult(store);
}
