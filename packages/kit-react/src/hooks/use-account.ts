import type {
    AccountNotificationsApi,
    Address,
    ClientWithRpc,
    ClientWithRpcSubscriptions,
    Decoder,
    GetAccountInfoApi,
    MaybeAccount,
    MaybeEncodedAccount,
} from '@solana/kit';
import { decodeAccount, parseBase64RpcAccount } from '@solana/kit';

import { useClientCapability } from '../client-capability';
import { useIdentityChurnWarning } from '../dev-warnings';
import type { LiveQueryResult } from '../internal/live-query-result';
import { createLiveDataSpec, useLiveData } from './use-live-data';

type AccountClient = ClientWithRpc<GetAccountInfoApi> & ClientWithRpcSubscriptions<AccountNotificationsApi>;

/**
 * Live-data builder for an on-chain account.
 *
 * When a `decoder` is supplied the data is decoded and returned as
 * `MaybeAccount<TData>`; otherwise the raw `MaybeEncodedAccount` is
 * returned.
 *
 * @typeParam TData - The decoded account shape when `decoder` is provided.
 * @param client - A Kit client with `rpc` and `rpcSubscriptions` installed.
 * @param address - The account address to observe.
 * @param decoder - Optional decoder used to type the account's `data` field.
 * @return A live-data spec pairing `getAccountInfo` with
 *         `accountNotifications`.
 */
export function createAccountLiveData<TData extends object>(
    client: AccountClient,
    address: Address,
    decoder?: Decoder<TData>,
) {
    const mapValue = (
        value: Parameters<typeof parseBase64RpcAccount>[1],
    ): MaybeAccount<TData> | MaybeEncodedAccount => {
        const encoded = parseBase64RpcAccount(address, value);
        return decoder ? decodeAccount(encoded, decoder) : encoded;
    };
    return createLiveDataSpec({
        rpcRequest: client.rpc.getAccountInfo(address, { encoding: 'base64' }),
        rpcSubscriptionRequest: client.rpcSubscriptions.accountNotifications(address, { encoding: 'base64' }),
        rpcSubscriptionValueMapper: mapValue,
        rpcValueMapper: mapValue,
    });
}

/**
 * Live account data for an address, returned in base64-encoded form.
 *
 * Combines `getAccountInfo` with `accountNotifications`, slot-tracked to
 * prevent out-of-order updates.
 *
 * @param address - Account to observe, or `null` to disable the query.
 * @return A {@link LiveQueryResult} carrying a `MaybeEncodedAccount`.
 * @throws An `Error` at mount if no RPC provider is installed.
 *
 * @example
 * ```tsx
 * const { data: account, status } = useAccount(address);
 * if (status === 'loaded' && account.exists) {
 *     console.log(account.data); // raw bytes
 * }
 * ```
 *
 * @see {@link createAccountLiveData}
 */
export function useAccount(address: Address | null): LiveQueryResult<MaybeEncodedAccount>;
/**
 * Live account data for an address, decoded via the supplied `Decoder`.
 *
 * Combines `getAccountInfo` with `accountNotifications`, slot-tracked to
 * prevent out-of-order updates.
 *
 * @typeParam TData - The decoded account shape.
 * @param address - Account to observe, or `null` to disable the query.
 * @param decoder - `Decoder` used to parse the account's raw data bytes.
 * @return A {@link LiveQueryResult} carrying a typed `MaybeAccount<TData>`.
 * @throws An `Error` at mount if no RPC provider is installed.
 *
 * @example
 * ```tsx
 * const { data: mint, status } = useAccount(mintAddress, getMintDecoder());
 * if (status === 'loaded' && mint.exists) {
 *     console.log(mint.data.supply);
 * }
 * ```
 */
export function useAccount<TData extends object>(
    address: Address | null,
    decoder: Decoder<TData>,
): LiveQueryResult<MaybeAccount<TData>>;
export function useAccount<TData extends object>(
    address: Address | null,
    decoder?: Decoder<TData>,
): LiveQueryResult<MaybeAccount<TData> | MaybeEncodedAccount> {
    const client = useClientCapability<AccountClient>({
        capability: ['rpc', 'rpcSubscriptions'],
        hookName: 'useAccount',
        providerHint: 'Mount <RpcProvider> or <RpcConnectionProvider>.',
    });
    // `decoder` feeds into the `useLiveData` dep list, so an inline
    // `getMintDecoder()` on every render would rebuild the store each time.
    // Fire the dev-only identity-churn warning to flag that footgun.
    useIdentityChurnWarning(decoder, {
        propName: 'decoder',
        providerName: 'useAccount',
        remedy: 'Memoize the decoder at the module level (e.g. `const MINT_DECODER = getMintDecoder()`) or wrap in `useMemo`.',
    });
    return useLiveData(
        () => (address ? createAccountLiveData(client, address, decoder) : null),
        [client, address, decoder],
    );
}
