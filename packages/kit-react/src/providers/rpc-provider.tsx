import type { Client, ClientWithPayer } from '@solana/kit';
import { solanaRpc, type SolanaRpcConfig } from '@solana/kit-plugin-rpc';
import { type ReactNode, useMemo } from 'react';

import { ClientContext, useClient } from '../client-context';
import { useIdentityChurnWarning } from '../dev-warnings';

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
export function RpcProvider({ children, ...config }: RpcProviderProps) {
    const parent = useClient();
    if (!('payer' in parent)) {
        throw new Error(
            "RpcProvider requires a payer. Wrap it in a WalletProvider (with role 'signer' or 'payer') or a PayerProvider. " +
                'For read-only apps that only need RPC reads, skip RpcProvider and use PluginProvider with ' +
                'solanaRpcConnection + solanaRpcSubscriptionsConnection instead.',
        );
    }
    const {
        maxConcurrency,
        priorityFees,
        rpcConfig,
        rpcSubscriptionsConfig,
        rpcSubscriptionsUrl,
        rpcUrl,
        skipPreflight,
    } = config;
    const client = useMemo(
        () =>
            (parent as Client<ClientWithPayer>).use(
                solanaRpc({
                    maxConcurrency,
                    priorityFees,
                    rpcConfig,
                    rpcSubscriptionsConfig,
                    rpcSubscriptionsUrl,
                    rpcUrl,
                    skipPreflight,
                }),
            ) as Client<object>,
        [
            parent,
            rpcUrl,
            rpcSubscriptionsUrl,
            maxConcurrency,
            priorityFees,
            skipPreflight,
            rpcConfig,
            rpcSubscriptionsConfig,
        ],
    );
    // Dev-only: warn when the two object-valued config props churn identity
    // across renders. A rebuilt plugin tears down the RPC subscription
    // connection and any in-flight transactions. Primitive props (URLs,
    // numbers, bigints) are stable by value so they're not tracked.
    useIdentityChurnWarning({
        consequence:
            'the RPC plugin chain is rebuilt on every render, tearing down the subscriptions connection and any in-flight transactions.',
        props: { rpcConfig, rpcSubscriptionsConfig },
        providerName: '<RpcProvider>',
    });
    return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>;
}
