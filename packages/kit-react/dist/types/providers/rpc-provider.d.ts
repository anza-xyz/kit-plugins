import { type SolanaRpcConfig } from '@solana/kit-plugin-rpc';
import { type ReactNode } from 'react';
/**
 * Props for {@link RpcProvider}.
 *
 * Extends {@link SolanaRpcConfig} directly so that every option accepted by
 * the underlying `solanaRpc` plugin (`rpcUrl`, `rpcSubscriptionsUrl`,
 * `maxConcurrency`, `priorityFees`, `rpcConfig`, `rpcSubscriptionsConfig`,
 * `skipPreflight`) is available on the provider without duplication. Adding
 * new config on the plugin surfaces here automatically.
 */
export type RpcProviderProps = SolanaRpcConfig & {
    children?: ReactNode;
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
 * For read-only apps that don't need transaction sending (explorers,
 * dashboards, watchers), skip this provider entirely and install just the
 * RPC + subscriptions plugins via `PluginProvider`:
 *
 * ```tsx
 * import { PluginProvider } from '@solana/kit-react';
 * import { solanaRpcConnection, solanaRpcSubscriptionsConnection } from '@solana/kit-plugin-rpc';
 *
 * <PluginProvider plugins={[
 *     solanaRpcConnection('https://api.mainnet-beta.solana.com'),
 *     solanaRpcSubscriptionsConnection('wss://api.mainnet-beta.solana.com'),
 * ]}>
 *     <App />
 * </PluginProvider>
 * ```
 *
 * `useBalance`, `useAccount`, `useTransactionConfirmation`, `useLiveQuery`,
 * and `useSubscription` all work against that lighter stack — only
 * transaction-sending hooks require the full `RpcProvider`.
 *
 * @throws If no ancestor provider has set `client.payer`.
 *
 * @example
 * ```tsx
 * <KitClientProvider chain="solana:mainnet">
 *     <WalletProvider>
 *         <RpcProvider rpcUrl="https://api.mainnet-beta.solana.com">
 *             <App />
 *         </RpcProvider>
 *     </WalletProvider>
 * </KitClientProvider>
 * ```
 */
export declare function RpcProvider({ children, ...config }: RpcProviderProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=rpc-provider.d.ts.map