import type { MicroLamports } from '@solana/kit';
import { type ReactNode } from 'react';
/** Props for {@link RpcProvider}. */
export type RpcProviderProps = {
    children?: ReactNode;
    /**
     * Maximum number of concurrent transaction executions allowed.
     *
     * @default 10
     */
    maxConcurrency?: number;
    /**
     * Priority fees to set on transactions in micro-lamports per compute unit.
     *
     * @default no priority fees
     */
    priorityFees?: MicroLamports;
    /**
     * Whether to skip the preflight simulation when sending transactions.
     *
     * @default false
     */
    skipPreflight?: boolean;
    /** URL of the Solana RPC endpoint. */
    url: string;
    /**
     * URL of the Solana RPC Subscriptions (WebSocket) endpoint.
     *
     * Defaults to the `url` with the protocol changed from `http(s)` to `ws(s)`.
     */
    wsUrl?: string;
};
/**
 * Installs a full Solana RPC plugin chain (`solanaRpc`) into the client —
 * providing `client.rpc`, `client.rpcSubscriptions`, transaction planning,
 * and transaction execution (`client.sendTransaction`, `client.sendTransactions`).
 *
 * Requires `client.payer` to already be set by an ancestor provider
 * ({@link WalletProvider} with role `"signer"` or `"payer"`, or
 * {@link PayerProvider}). Throws at render if no payer is present.
 *
 * @throws If no ancestor provider has set `client.payer`.
 *
 * @example
 * ```tsx
 * <KitClientProvider chain="solana:mainnet">
 *     <WalletProvider>
 *         <RpcProvider url="https://api.mainnet-beta.solana.com">
 *             <App />
 *         </RpcProvider>
 *     </WalletProvider>
 * </KitClientProvider>
 * ```
 */
export declare function RpcProvider({ children, maxConcurrency, priorityFees, skipPreflight, url, wsUrl }: RpcProviderProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=rpc-provider.d.ts.map