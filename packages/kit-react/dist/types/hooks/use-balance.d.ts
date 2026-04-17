import { type Address, type Lamports } from '@solana/kit';
import { type LiveQueryResult } from '../internal/live-store';
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
 * const connected = useConnectedWallet();
 * const { data: balance, isLoading } = useBalance(connected?.account.address ?? null);
 * ```
 *
 * @see {@link useAccount}
 */
export declare function useBalance(address: Address | null): LiveQueryResult<Lamports>;
//# sourceMappingURL=use-balance.d.ts.map