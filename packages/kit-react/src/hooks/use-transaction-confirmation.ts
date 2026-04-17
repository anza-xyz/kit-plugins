import {
    type Commitment,
    createReactiveStoreWithInitialValueAndSlotTracking,
    type Signature,
    type TransactionError,
} from '@solana/kit';

import {
    disabledLiveStore,
    type LiveQueryResult,
    type LiveStore,
    useLiveQueryResult,
    useLiveStore,
} from '../internal/live-store';
import { useRpcClient } from '../internal/rpc-client';

/** The confirmation status of a transaction. */
export type TransactionConfirmationStatus = {
    /** The commitment level that the transaction has currently reached, or `null` if unknown. */
    readonly confirmationStatus: Commitment | null;
    /** Number of blocks since the transaction was processed, or `null` for the initial snapshot. */
    readonly confirmations: bigint | null;
    /** The transaction error, or `null` if the transaction succeeded. */
    readonly err: TransactionError | null;
};

/** Options for {@link useTransactionConfirmation}. */
export type UseTransactionConfirmationOptions = {
    /**
     * The commitment level to wait for.
     *
     * @default 'confirmed'
     */
    commitment?: Commitment;
};

/**
 * Subscribe to the confirmation status of a transaction signature.
 *
 * Combines `getSignatureStatuses` (for the initial snapshot) +
 * `signatureNotifications` (for ongoing updates) with slot-based dedup, so
 * you can reactively display "pending → confirmed → finalized" without
 * polling.
 *
 * Pass `null` for the signature to disable (e.g. before the transaction has
 * been sent). A disabled query reports `{ data: undefined, error: undefined,
 * isLoading: false }` — matching react-query / SWR semantics when the key is
 * `null`.
 *
 * @param signature - The transaction signature to watch, or `null`.
 * @param options - Optional confirmation level.
 * @returns `{ data, error, isLoading }`. `data` is a
 *   {@link TransactionConfirmationStatus} or `undefined` while loading.
 * @throws If no ancestor {@link RpcProvider} is mounted.
 */
export function useTransactionConfirmation(
    signature: Signature | null,
    options?: UseTransactionConfirmationOptions,
): LiveQueryResult<TransactionConfirmationStatus> {
    const client = useRpcClient('useTransactionConfirmation');
    const commitment = options?.commitment ?? 'confirmed';

    const store = useLiveStore<LiveStore<TransactionConfirmationStatus>>(
        signal => {
            if (signature == null) {
                return disabledLiveStore<TransactionConfirmationStatus>();
            }
            return createReactiveStoreWithInitialValueAndSlotTracking({
                abortSignal: signal,
                rpcRequest: client.rpc.getSignatureStatuses([signature]),
                rpcSubscriptionRequest: client.rpcSubscriptions.signatureNotifications(signature, { commitment }),
                rpcSubscriptionValueMapper: notification => ({
                    confirmationStatus: commitment,
                    confirmations: null,
                    err: notification.err,
                }),
                rpcValueMapper: statuses => {
                    const status = statuses[0];
                    return status
                        ? {
                              confirmationStatus: status.confirmationStatus ?? null,
                              confirmations: status.confirmations,
                              err: status.err,
                          }
                        : { confirmationStatus: null, confirmations: null, err: null };
                },
            });
        },
        [client, signature, commitment],
    );
    return useLiveQueryResult(store);
}
