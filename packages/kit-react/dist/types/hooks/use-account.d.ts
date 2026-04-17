import { type Account, type Address, type Decoder, type EncodedAccount } from '@solana/kit';
import { type LiveQueryResult } from '../internal/live-store';
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
export declare function useAccount(address: Address | null): LiveQueryResult<EncodedAccount | null>;
export declare function useAccount<TData extends object>(address: Address | null, decoder: Decoder<TData>): LiveQueryResult<Account<TData> | null>;
//# sourceMappingURL=use-account.d.ts.map