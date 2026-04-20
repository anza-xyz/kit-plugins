import { type SolanaRpcReadOnlyConfig } from '@solana/kit-plugin-rpc';
import { type ReactNode } from 'react';
/**
 * Props for {@link RpcReadOnlyProvider}.
 *
 * Extends {@link SolanaRpcReadOnlyConfig} directly so every option accepted
 * by the underlying `solanaRpcReadOnly` plugin (`rpcUrl`,
 * `rpcSubscriptionsUrl`, `rpcConfig`, `rpcSubscriptionsConfig`) is available
 * on the provider with no drift.
 */
export type RpcReadOnlyProviderProps = SolanaRpcReadOnlyConfig & {
    children?: ReactNode;
};
/**
 * Installs the read-only Solana RPC plugin chain (`solanaRpcReadOnly`) —
 * `client.rpc`, `client.rpcSubscriptions`, and `client.getMinimumBalance` —
 * without the transaction-planning / transaction-sending halves. Has no
 * payer prerequisite, so dashboards, explorers, watchers, and other
 * read-only flows can skip `WalletProvider` / `PayerProvider` entirely.
 *
 * For apps that do send transactions, use {@link RpcProvider} instead.
 *
 * `useBalance`, `useAccount`, `useTransactionConfirmation`, `useLiveQuery`,
 * and `useSubscription` all work against this stack; only the transaction
 * hooks (`useSendTransaction`, `useSendTransactions`, `usePlanTransaction`,
 * `usePlanTransactions`) require the full {@link RpcProvider}.
 *
 * @example
 * ```tsx
 * <KitClientProvider chain="solana:mainnet">
 *     <RpcReadOnlyProvider rpcUrl="https://api.mainnet-beta.solana.com">
 *         <Dashboard />
 *     </RpcReadOnlyProvider>
 * </KitClientProvider>
 * ```
 *
 * @see {@link RpcProvider}
 */
export declare function RpcReadOnlyProvider({ children, ...config }: RpcReadOnlyProviderProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=rpc-read-only-provider.d.ts.map