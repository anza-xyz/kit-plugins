import type { Client } from '@solana/kit';
import { solanaRpc, type SolanaRpcConfig } from '@solana/kit-plugin-rpc';
import { type ReactNode, useMemo } from 'react';

import { ClientContext } from '../client-context';
import { useIdentityChurnWarning } from '../dev-warnings';
import { useParentWithPayer } from '../internal/parent-assertions';

/**
 * Props for {@link RpcProvider}.
 *
 * Extends {@link SolanaRpcConfig} directly so that every option accepted by
 * the underlying `solanaRpc` plugin (`rpcUrl`, `rpcSubscriptionsUrl`,
 * `maxConcurrency`, `rpcConfig`, `rpcSubscriptionsConfig`, `skipPreflight`,
 * `transactionConfig`) is available on the provider without duplication.
 * Adding new config on the plugin surfaces here automatically.
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
    const parent = useParentWithPayer(
        'RpcProvider',
        'For read-only apps that only need RPC reads, skip RpcProvider and use PluginProvider with ' +
            'solanaRpcConnection + solanaRpcSubscriptionsConnection instead.',
    );
    const {
        maxConcurrency,
        rpcConfig,
        rpcSubscriptionsConfig,
        rpcSubscriptionsUrl,
        rpcUrl,
        skipPreflight,
        transactionConfig,
    } = config;
    const client = useMemo(
        () =>
            parent.use(
                solanaRpc({
                    maxConcurrency,
                    rpcConfig,
                    rpcSubscriptionsConfig,
                    rpcSubscriptionsUrl,
                    rpcUrl,
                    skipPreflight,
                    transactionConfig,
                }),
            ) as Client<object>,
        [
            parent,
            rpcUrl,
            rpcSubscriptionsUrl,
            maxConcurrency,
            skipPreflight,
            rpcConfig,
            rpcSubscriptionsConfig,
            transactionConfig,
        ],
    );
    // Dev-only: warn when object-valued config props churn identity across
    // renders. A rebuilt plugin tears down the RPC subscription connection
    // and any in-flight transactions. Primitive props (URLs, numbers, bigints)
    // are stable by value so they're not tracked.
    useIdentityChurnWarning({
        consequence:
            'the RPC plugin chain is rebuilt on every render, tearing down the subscriptions connection and any in-flight transactions.',
        props: { rpcConfig, rpcSubscriptionsConfig, transactionConfig },
        providerName: '<RpcProvider>',
    });
    return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>;
}
