import { extendClient, Rpc, RpcSubscriptions } from '@solana/kit';

/**
 * Enhances a client with an RPC connection from a provided {@link Rpc} instance.
 *
 * This is a generic plugin that works with any RPC API. For a Solana-specific
 * alternative that creates the RPC from a URL, see {@link solanaRpcConnection}.
 *
 * @param rpc - The RPC instance to install on the client.
 * @return A plugin that adds `client.rpc`.
 *
 * @example
 * ```ts
 * import { createClient, createSolanaRpc } from '@solana/kit';
 * import { rpcConnection } from '@solana/kit-plugin-rpc';
 *
 * const myRpc = createSolanaRpc('https://api.mainnet-beta.solana.com');
 * const client = createClient().use(rpcConnection(myRpc));
 * const { value: latestBlockhash } = await client.rpc.getLatestBlockhash().send();
 * ```
 *
 * @see {@link solanaRpcConnection}
 * @see {@link rpcSubscriptionsConnection}
 */
export function rpcConnection<TApi>(rpc: Rpc<TApi>) {
    return <T extends object>(client: T) => extendClient(client, { rpc });
}

/**
 * Enhances a client with an RPC Subscriptions connection from a provided
 * {@link RpcSubscriptions} instance.
 *
 * This is a generic plugin that works with any RPC Subscriptions API. For a
 * Solana-specific alternative that creates the subscriptions from a URL,
 * see {@link solanaRpcSubscriptionsConnection}.
 *
 * @param rpcSubscriptions - The RPC Subscriptions instance to install on the client.
 * @return A plugin that adds `client.rpcSubscriptions`.
 *
 * @example
 * ```ts
 * import { createClient, createSolanaRpcSubscriptions } from '@solana/kit';
 * import { rpcSubscriptionsConnection } from '@solana/kit-plugin-rpc';
 *
 * const myRpcSubscriptions = createSolanaRpcSubscriptions('wss://api.mainnet-beta.solana.com');
 * const client = createClient().use(rpcSubscriptionsConnection(myRpcSubscriptions));
 * ```
 *
 * @see {@link solanaRpcSubscriptionsConnection}
 * @see {@link rpcConnection}
 */
export function rpcSubscriptionsConnection<TApi>(rpcSubscriptions: RpcSubscriptions<TApi>) {
    return <T extends object>(client: T) => extendClient(client, { rpcSubscriptions });
}
