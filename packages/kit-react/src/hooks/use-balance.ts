import type {
    AccountNotificationsApi,
    Address,
    ClientWithRpc,
    ClientWithRpcSubscriptions,
    GetBalanceApi,
    Lamports,
} from '@solana/kit';

import { useClientCapability } from '../client-capability';
import type { LiveQueryResult } from '../internal/live-query-result';
import { createLiveDataSpec, useLiveData } from './use-live-data';

type BalanceClient = ClientWithRpc<GetBalanceApi> & ClientWithRpcSubscriptions<AccountNotificationsApi>;

/**
 * Live-data builder for the SOL balance of an address.
 *
 * The returned spec is cache-library agnostic: it works with
 * {@link useLiveData} and, in the adapter packages, with `useLiveSwr` /
 * `useLiveQuery`.
 *
 * @param client - A Kit client with `rpc` and `rpcSubscriptions` installed.
 * @param address - The account whose SOL balance should be observed.
 * @return A live-data spec pairing `getBalance` with
 *         `accountNotifications`.
 */
export function createBalanceLiveData(client: BalanceClient, address: Address) {
    return createLiveDataSpec({
        rpcRequest: client.rpc.getBalance(address),
        rpcSubscriptionRequest: client.rpcSubscriptions.accountNotifications(address),
        rpcSubscriptionValueMapper: notification => notification.lamports,
        rpcValueMapper: value => value,
    });
}

/**
 * Live SOL balance for an address.
 *
 * Combines `getBalance` with slot-tracked `accountNotifications` so later
 * updates supersede earlier ones regardless of arrival order.
 *
 * @param address - Account to observe, or `null` to disable the query.
 * @return A {@link LiveQueryResult} carrying the current balance, status,
 *         error, slot, and a `retry` affordance.
 * @throws An `Error` at mount if no RPC provider is installed.
 *
 * @example
 * ```tsx
 * const { data, status, retry } = useBalance(address);
 * if (status === 'loading') return <Spinner />;
 * if (status === 'error') return <button onClick={retry}>Retry</button>;
 * return <Lamports value={data} />;
 * ```
 *
 * @see {@link createBalanceLiveData}
 */
export function useBalance(address: Address | null): LiveQueryResult<Lamports> {
    const client = useClientCapability<BalanceClient>({
        capability: ['rpc', 'rpcSubscriptions'],
        hookName: 'useBalance',
        providerHint: 'Mount <RpcProvider> or <RpcConnectionProvider>.',
    });
    return useLiveData(() => (address ? createBalanceLiveData(client, address) : null), [client, address]);
}
