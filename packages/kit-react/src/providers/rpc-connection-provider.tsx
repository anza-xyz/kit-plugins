import { solanaRpcConnection, SolanaRpcConnectionConfig } from '@solana/kit-plugin-rpc';
import { type ReactNode, useMemo } from 'react';

import { ChainContext, type ChainIdentifier } from '../client-context';
import { PluginProvider } from './plugin-provider';

/**
 * Props for {@link RpcConnectionProvider}. Installs `client.rpc` and
 * `client.rpcSubscriptions` from the configured URLs — no payer required.
 */
export type RpcConnectionProviderProps = Readonly<
    SolanaRpcConnectionConfig<string> & {
        /**
         * Optional chain identifier to publish to the subtree. When set,
         * overrides any chain set by an ancestor {@link KitClientProvider}.
         * Use this when the generic connection provider is the thing that
         * knows the cluster (e.g. custom RPC URL for a fork).
         */
        chain?: ChainIdentifier;
        children?: ReactNode;
    }
>;

/**
 * Connection-only provider.
 *
 * Installs `client.rpc` and `client.rpcSubscriptions` without any
 * transaction-planning or execution halves. Suitable for explorers,
 * dashboards, watchers, and server-side scripts that never send
 * transactions. For apps that send transactions, use {@link RpcProvider}
 * instead.
 *
 * @param props - Endpoint URLs, optional forwarded configs, and an
 *                optional chain override.
 * @return A React element that re-publishes the extended client.
 *
 * @example
 * ```tsx
 * <RpcConnectionProvider rpcUrl="https://api.mainnet-beta.solana.com">
 *     <Dashboard />
 * </RpcConnectionProvider>
 * ```
 *
 * @see {@link RpcProvider}
 */
export function RpcConnectionProvider({
    chain,
    children,
    rpcUrl,
    rpcSubscriptionsUrl,
    rpcConfig,
    rpcSubscriptionsConfig,
}: RpcConnectionProviderProps) {
    // `satisfies Record<keyof SolanaRpcConnectionConfig<string>, unknown>`
    // guards against drift: if Kit adds a field to the config, TypeScript
    // flags the missing key here instead of the provider silently failing
    // to rebuild on it.
    const depsByKey = {
        rpcConfig,
        rpcSubscriptionsConfig,
        rpcSubscriptionsUrl,
        rpcUrl,
    } satisfies Record<keyof SolanaRpcConnectionConfig<string>, unknown>;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const plugins = useMemo(
        () => [solanaRpcConnection({ rpcConfig, rpcSubscriptionsConfig, rpcSubscriptionsUrl, rpcUrl })],
        Object.values(depsByKey),
    );
    const tree = <PluginProvider plugins={plugins}>{children}</PluginProvider>;
    return chain ? <ChainContext.Provider value={chain}>{tree}</ChainContext.Provider> : tree;
}
