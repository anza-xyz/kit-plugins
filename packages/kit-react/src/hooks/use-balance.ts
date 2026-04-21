import { type Address, createReactiveStoreWithInitialValueAndSlotTracking, type Lamports } from '@solana/kit';

import {
    disabledLiveStore,
    type LiveQueryResult,
    type LiveStore,
    useLiveQueryResult,
    useLiveStore,
} from '../internal/live-store';
import { useRpcClient } from '../internal/rpc-client';

/**
 * Subscribe to the SOL balance of an address.
 *
 * Combines `getBalance` + `accountNotifications` into a single reactive query
 * with slot-based dedup — a late-arriving RPC response will never overwrite
 * a newer subscription notification.
 *
 * Pass `null` to disable the query (e.g. when the wallet is not yet
 * connected). A disabled query reports `{ data: undefined, error: undefined,
 * isLoading: false }` — matching react-query / SWR semantics when the key is
 * `null`, so you can render an empty / placeholder state without a spinner.
 *
 * @param address - The address whose balance to watch, or `null` to disable.
 * @returns `{ data, error, isLoading }`. `data` is a {@link Lamports} value
 *   on success, or `undefined` while loading or disabled.
 * @throws If no ancestor {@link RpcProvider} is mounted.
 *
 * @example
 * ```tsx
 * // Prefer optional-chaining to `null` over early-return before the hook.
 * // Rules of hooks forbids conditional hook calls; the `?? null` pattern lets
 * // the hook always run, disabled until the address is available.
 * const connected = useConnectedWallet();
 * const { data: balance, isLoading } = useBalance(connected?.account.address ?? null);
 * if (!connected) return <ConnectButton />;
 * ```
 *
 * @see {@link useAccount}
 */
export function useBalance(address: Address | null): LiveQueryResult<Lamports> {
    const client = useRpcClient('useBalance');
    const store = useLiveStore<LiveStore<Lamports>>(
        signal => {
            if (address == null) {
                return disabledLiveStore<Lamports>();
            }
            return createReactiveStoreWithInitialValueAndSlotTracking({
                abortSignal: signal,
                rpcRequest: client.rpc.getBalance(address),
                rpcSubscriptionRequest: client.rpcSubscriptions.accountNotifications(address),
                rpcSubscriptionValueMapper: ({ lamports }) => lamports,
                rpcValueMapper: lamports => lamports,
            });
        },
        [client, address],
    );
    return useLiveQueryResult(store);
}
