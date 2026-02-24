import {
    ClusterUrl,
    createSolanaRpc,
    createSolanaRpcSubscriptions,
    DefaultRpcSubscriptionsChannelConfig,
} from '@solana/kit';

/**
 * Enhances a client with Solana RPC and RPC Subscriptions capabilities.
 *
 * @param url - The URL of the Solana cluster.
 * @param rpcSubscriptionsConfig - Optional configuration for RPC subscriptions.
 *
 * @example
 * ```ts
 * import { createEmptyClient } from '@solana/kit';
 * import { rpc } from '@solana/kit-plugins';
 *
 * // Install the RPC plugin.
 * const client = createEmptyClient().use(rpc('https://api.mainnet-beta.solana.com'));
 *
 * // Make RPC calls.
 * const { value: latestBlockhash } = await client.rpc.getLatestBlockhash().send();
 *
 * // Subscribe to RPC notifications.
 * const slotNotifications = await client.rpcSubscriptions.slotNotifications({ commitment: 'confirmed' }).subscribe();
 * for await (const slotNotification of slotNotifications) {
 *     console.log('Got a slot notification', slotNotification);
 * }
 * ```
 *
 * @see {@link localhostRpc}
 */
export function rpc<TClusterUrl extends ClusterUrl>(
    url: TClusterUrl,
    rpcSubscriptionsConfig?: DefaultRpcSubscriptionsChannelConfig<TClusterUrl>,
) {
    const rpc = createSolanaRpc(url);
    const rpcSubscriptionsUrl = rpcSubscriptionsConfig?.url ?? url.replace(/^http/, 'ws');
    const rpcSubscriptions = createSolanaRpcSubscriptions(rpcSubscriptionsUrl, rpcSubscriptionsConfig);
    return <T extends object>(client: T) => ({ ...client, rpc, rpcSubscriptions });
}

/**
 * Enhances a client with Solana RPC and RPC Subscriptions capabilities
 * using to a local validator.
 *
 * @example
 * ```ts
 * import { createEmptyClient } from '@solana/kit';
 * import { rpc } from '@solana/kit-plugins';
 *
 * // Install the Localhost RPC plugin.
 * const client = createEmptyClient().use(localhostRpc());
 *
 * // Make RPC calls.
 * const { value: latestBlockhash } = await client.rpc.getLatestBlockhash().send();
 *
 * // Subscribe to RPC notifications.
 * const slotNotifications = await client.rpcSubscriptions.slotNotifications({ commitment: 'confirmed' }).subscribe();
 * for await (const slotNotification of slotNotifications) {
 *     console.log('Got a slot notification', slotNotification);
 * }
 * ```
 *
 * @see {@link rpc}
 */
export function localhostRpc(url?: string, rpcSubscriptionsConfig?: { url: string }) {
    return rpc(url ?? 'http://127.0.0.1:8899', rpcSubscriptionsConfig ?? { url: 'ws://127.0.0.1:8900' });
}
