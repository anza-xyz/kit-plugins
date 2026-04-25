import type {
    ClientWithRpc,
    ClientWithRpcSubscriptions,
    Commitment,
    GetSignatureStatusesApi,
    Signature,
    SignatureNotificationsApi,
    TransactionError,
} from '@solana/kit';

import { useClientCapability } from '../client-capability';
import type { LiveQueryResult } from '../internal/live-query-result';
import { createLiveDataSpec, useLiveData } from './use-live-data';

type ConfirmationClient = ClientWithRpc<GetSignatureStatusesApi> &
    ClientWithRpcSubscriptions<SignatureNotificationsApi>;

/** Snapshot of a transaction's confirmation state. */
export type TransactionConfirmationStatus = {
    confirmationStatus: Commitment | null;
    err: TransactionError | null;
};

/** Options for {@link useTransactionConfirmation}. */
export type UseTransactionConfirmationOptions = Readonly<{
    /** Target commitment; defaults to `'confirmed'`. */
    commitment?: Commitment;
}>;

/**
 * Live-data builder for the confirmation status of a single signature.
 *
 * @param client - A Kit client with `rpc` and `rpcSubscriptions` installed.
 * @param signature - Transaction signature to observe.
 * @param commitment - Commitment level for the underlying subscription.
 * @return A live-data spec pairing `getSignatureStatuses` with
 *         `signatureNotifications`.
 */
export function createTransactionConfirmationLiveData(
    client: ConfirmationClient,
    signature: Signature,
    commitment: Commitment,
) {
    return createLiveDataSpec({
        rpcRequest: client.rpc.getSignatureStatuses([signature]),
        rpcSubscriptionRequest: client.rpcSubscriptions.signatureNotifications(signature, { commitment }),
        rpcSubscriptionValueMapper: (notification): TransactionConfirmationStatus => ({
            confirmationStatus: commitment,
            err: notification.err,
        }),
        rpcValueMapper: (statuses): TransactionConfirmationStatus => {
            const status = statuses[0];
            if (!status) return { confirmationStatus: null, err: null };
            return {
                confirmationStatus: status.confirmationStatus,
                err: status.err,
            };
        },
    });
}

/**
 * Live confirmation status for a transaction signature.
 *
 * Combines `getSignatureStatuses` with `signatureNotifications` so later
 * updates supersede earlier ones regardless of arrival order.
 *
 * @param signature - Signature to observe, or `null` to disable the query
 *                    (e.g. before a transaction is sent).
 * @param options - Optional overrides, such as the target `commitment`.
 * @return A {@link LiveQueryResult} carrying the current confirmation
 *         snapshot, status, error, slot, and a `retry` affordance.
 * @throws An `Error` at mount if no RPC provider is installed.
 *
 * @example
 * ```tsx
 * const { data, status } = useTransactionConfirmation(signature, {
 *     commitment: 'finalized',
 * });
 * if (data?.confirmationStatus === 'finalized') { ... }
 * ```
 *
 * @see {@link createTransactionConfirmationLiveData}
 */
export function useTransactionConfirmation(
    signature: Signature | null,
    options?: UseTransactionConfirmationOptions,
): LiveQueryResult<TransactionConfirmationStatus> {
    const client = useClientCapability<ConfirmationClient>({
        capability: ['rpc', 'rpcSubscriptions'],
        hookName: 'useTransactionConfirmation',
        providerHint: 'Install `solanaRpc()` or `solanaRpcConnection()` on the client.',
    });
    const commitment = options?.commitment ?? 'confirmed';
    return useLiveData(
        () => (signature ? createTransactionConfirmationLiveData(client, signature, commitment) : null),
        [client, signature, commitment],
    );
}
