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
    disabledLiveStore,
    type LiveQueryResult,
    type LiveStore,
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
 * Pass `null` for the address to disable the query. A disabled query reports
 * `{ data: undefined, error: undefined, isLoading: false }` — matching
 * react-query / SWR semantics when the key is `null`.
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
 *
 * **Decoder identity matters.** A new `decoder` reference on each render
 * rebuilds the underlying store, tearing down the subscription. Hoist the
 * decoder to module scope (or memoize it) so the identity is stable:
 *
 * ```tsx
 * // Module scope — stable identity across renders.
 * const gameStateDecoder = getGameStateDecoder();
 *
 * function GameView({ gameAddress }: { gameAddress: Address }) {
 *     const { data } = useAccount(gameAddress, gameStateDecoder);
 *     // ...
 * }
 * ```
 *
 * `react-hooks/exhaustive-deps` will flag inline decoders in *your* call
 * site's deps list, which is the idiomatic feedback loop for this kind of
 * mistake.
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
                return disabledLiveStore<Account<TData> | EncodedAccount | null>();
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
