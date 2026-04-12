import {
    ClusterUrl,
    createSolanaRpc,
    createSolanaRpcSubscriptions,
    DefaultRpcSubscriptionsChannelConfig,
    extendClient,
} from '@solana/kit';

import { rpcConnection, rpcSubscriptionsConnection } from './rpc';

/**
 * Enhances a client with a Solana RPC connection created from a cluster URL.
 *
 * This plugin creates a Solana RPC using {@link createSolanaRpc} and installs it
 * on the client via {@link rpcConnection}.
 *
 * @param url - The URL of the Solana cluster.
 * @param config - Optional configuration forwarded to {@link createSolanaRpc}.
 * @return A plugin that adds `client.rpc`.
 *
 * @example
 * ```ts
 * import { createClient } from '@solana/kit';
 * import { solanaRpcConnection } from '@solana/kit-plugin-rpc';
 *
 * const client = createClient().use(solanaRpcConnection('https://api.mainnet-beta.solana.com'));
 * const { value: latestBlockhash } = await client.rpc.getLatestBlockhash().send();
 * ```
 *
 * @see {@link solanaRpcSubscriptionsConnection}
 * @see {@link rpcConnection}
 */
export function solanaRpcConnection<TClusterUrl extends ClusterUrl>(
    url: TClusterUrl,
    config?: Parameters<typeof createSolanaRpc<TClusterUrl>>[1],
) {
    return rpcConnection(createSolanaRpc<TClusterUrl>(url, config));
}

/**
 * Enhances a client with a Solana RPC Subscriptions connection created from a cluster URL.
 *
 * This plugin creates Solana RPC Subscriptions using {@link createSolanaRpcSubscriptions}
 * and installs them on the client via {@link rpcSubscriptionsConnection}.
 *
 * @param url - The URL of the Solana cluster.
 * @param config - Optional configuration forwarded to {@link createSolanaRpcSubscriptions}.
 * @return A plugin that adds `client.rpcSubscriptions`.
 *
 * @example
 * ```ts
 * import { createClient } from '@solana/kit';
 * import { solanaRpcSubscriptionsConnection } from '@solana/kit-plugin-rpc';
 *
 * const client = createClient()
 *     .use(solanaRpcSubscriptionsConnection('wss://api.mainnet-beta.solana.com'));
 * ```
 *
 * @see {@link solanaRpcConnection}
 * @see {@link rpcSubscriptionsConnection}
 */
export function solanaRpcSubscriptionsConnection<TClusterUrl extends ClusterUrl>(
    url: TClusterUrl,
    config?: Parameters<typeof createSolanaRpcSubscriptions<TClusterUrl>>[1],
) {
    return rpcSubscriptionsConnection(createSolanaRpcSubscriptions<TClusterUrl>(url, config));
}

/**
 * Enhances a client with Solana RPC and RPC Subscriptions capabilities.
 *
 * @deprecated Use {@link solanaRpcConnection} and {@link solanaRpcSubscriptionsConnection} instead.
 * ```ts
 * // Before
 * const client = createClient().use(rpc('https://api.mainnet-beta.solana.com'));
 *
 * // After
 * const client = createClient()
 *     .use(solanaRpcConnection('https://api.mainnet-beta.solana.com'))
 *     .use(solanaRpcSubscriptionsConnection('wss://api.mainnet-beta.solana.com'));
 * ```
 */
export function rpc<TClusterUrl extends ClusterUrl>(
    url: TClusterUrl,
    rpcSubscriptionsConfig?: DefaultRpcSubscriptionsChannelConfig<TClusterUrl>,
) {
    const rpc = createSolanaRpc(url);
    const rpcSubscriptionsUrl = rpcSubscriptionsConfig?.url ?? url.replace(/^http/, 'ws');
    const rpcSubscriptions = createSolanaRpcSubscriptions(rpcSubscriptionsUrl, rpcSubscriptionsConfig);
    return <T extends object>(client: T) => extendClient(client, { rpc, rpcSubscriptions });
}

/**
 * Enhances a client with Solana RPC and RPC Subscriptions capabilities
 * using a local validator.
 *
 * @deprecated Use {@link solanaRpcConnection} and {@link solanaRpcSubscriptionsConnection} instead.
 * ```ts
 * // Before
 * const client = createClient().use(localhostRpc());
 *
 * // After
 * const client = createClient()
 *     .use(solanaRpcConnection('http://127.0.0.1:8899'))
 *     .use(solanaRpcSubscriptionsConnection('ws://127.0.0.1:8900'));
 * ```
 */
export function localhostRpc(url?: string, rpcSubscriptionsConfig?: DefaultRpcSubscriptionsChannelConfig<string>) {
    return rpc<string>(url ?? 'http://127.0.0.1:8899', rpcSubscriptionsConfig ?? { url: 'ws://127.0.0.1:8900' });
}
