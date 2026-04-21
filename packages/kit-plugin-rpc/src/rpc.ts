import { extendClient, Rpc, RpcSubscriptions } from '@solana/kit';

/**
 * Enhances a client with an RPC connection from a provided {@link Rpc} instance.
 *
 * @param rpc - The RPC instance to install on the client.
 * @return A plugin that adds `client.rpc`.
 *
 * @deprecated This helper is a trivial wrapper around `extendClient`. Prefer
 * {@link solanaRpcConnection} when you need a Solana RPC from a cluster URL,
 * or inline `extendClient({ rpc })` when you already have an `Rpc` instance.
 *
 * ```ts
 * // Before
 * const myRpc = createSolanaRpc('https://api.mainnet-beta.solana.com');
 * const client = createClient().use(rpcConnection(myRpc));
 *
 * // After — when you have a URL
 * const client = createClient().use(
 *     solanaRpcConnection({ rpcUrl: 'https://api.mainnet-beta.solana.com' }),
 * );
 *
 * // After — when you already have an Rpc instance
 * import { extendClient } from '@solana/kit';
 *
 * const client = createClient().use(c => extendClient(c, { rpc: myRpc }));
 * ```
 */
export function rpcConnection<TApi>(rpc: Rpc<TApi>) {
    return <T extends object>(client: T) => extendClient(client, { rpc });
}

/**
 * Enhances a client with an RPC Subscriptions connection from a provided
 * {@link RpcSubscriptions} instance.
 *
 * @param rpcSubscriptions - The RPC Subscriptions instance to install on the client.
 * @return A plugin that adds `client.rpcSubscriptions`.
 *
 * @deprecated This helper is a trivial wrapper around `extendClient`. Prefer
 * {@link solanaRpcConnection} when you need Solana RPC Subscriptions from a
 * cluster URL (it installs both `rpc` and `rpcSubscriptions`), or inline
 * `extendClient({ rpcSubscriptions })` when you already have an
 * `RpcSubscriptions` instance.
 *
 * ```ts
 * // Before
 * const myRpcSubscriptions = createSolanaRpcSubscriptions('wss://api.mainnet-beta.solana.com');
 * const client = createClient().use(rpcSubscriptionsConnection(myRpcSubscriptions));
 *
 * // After — when you have a URL
 * const client = createClient().use(
 *     solanaRpcConnection({ rpcUrl: 'https://api.mainnet-beta.solana.com' }),
 * );
 *
 * // After — when you already have an RpcSubscriptions instance
 * import { extendClient } from '@solana/kit';
 *
 * const client = createClient().use(c => extendClient(c, { rpcSubscriptions: myRpcSubscriptions }));
 * ```
 */
export function rpcSubscriptionsConnection<TApi>(rpcSubscriptions: RpcSubscriptions<TApi>) {
    return <T extends object>(client: T) => extendClient(client, { rpcSubscriptions });
}
