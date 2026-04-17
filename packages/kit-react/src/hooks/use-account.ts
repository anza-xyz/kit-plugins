import {
    type Account,
    type Address,
    createReactiveStoreWithInitialValueAndSlotTracking,
    decodeAccount,
    type Decoder,
    type EncodedAccount,
    parseBase64RpcAccount,
} from '@solana/kit';

import {
    type LiveQueryResult,
    type LiveStore,
    nullLiveStore,
    useLiveQueryResult,
    useLiveStore,
} from '../internal/live-store';
import { useRpcClient } from '../internal/rpc-client';

/**
 * Subscribe to an account for an address.
 *
 * Combines `getAccountInfo` + `accountNotifications` into a single reactive
 * query with slot-based dedup. When a {@link Decoder} is provided, the
 * account data is decoded and returned as a typed {@link Account}. Without a
 * decoder, returns the raw {@link EncodedAccount}.
 *
 * Pass `null` for the address to disable the query.
 *
 * @param address - The address to watch, or `null` to disable.
 * @returns `{ data, error, isLoading }`. `data` is an `EncodedAccount | null`
 *   (or `Account<TData> | null` with a decoder), or `undefined` while loading.
 * @throws If no ancestor {@link RpcProvider} is mounted.
 *
 * @example
 * ```tsx
 * const { data: account } = useAccount(address);
 * ```
 *
 * @example With a decoder
 * ```tsx
 * const { data } = useAccount(gameAddress, getGameStateDecoder());
 * ```
 *
 * @see {@link useBalance}
 */
export function useAccount(address: Address | null): LiveQueryResult<EncodedAccount | null>;
export function useAccount<TData extends object>(
    address: Address | null,
    decoder: Decoder<TData>,
): LiveQueryResult<Account<TData> | null>;
export function useAccount<TData extends object>(
    address: Address | null,
    decoder?: Decoder<TData>,
): LiveQueryResult<Account<TData> | EncodedAccount | null> {
    const client = useRpcClient('useAccount');
    const store = useLiveStore<LiveStore<Account<TData> | EncodedAccount | null>>(
        signal => {
            if (address == null) {
                return nullLiveStore<Account<TData> | EncodedAccount | null>();
            }
            return createReactiveStoreWithInitialValueAndSlotTracking({
                abortSignal: signal,
                rpcRequest: client.rpc.getAccountInfo(address, { encoding: 'base64' }),
                rpcSubscriptionRequest: client.rpcSubscriptions.accountNotifications(address, { encoding: 'base64' }),
                rpcSubscriptionValueMapper: value => {
                    if (!value) return null;
                    const encoded = parseBase64RpcAccount(address, value);
                    return decoder ? decodeAccount(encoded, decoder) : encoded;
                },
                rpcValueMapper: value => {
                    if (!value) return null;
                    const encoded = parseBase64RpcAccount(address, value);
                    return decoder ? decodeAccount(encoded, decoder) : encoded;
                },
            });
        },
        [client, address, decoder],
    );
    return useLiveQueryResult(store);
}
