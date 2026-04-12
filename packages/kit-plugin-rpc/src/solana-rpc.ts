import {
    ClientWithPayer,
    ClusterUrl,
    createSolanaRpc,
    createSolanaRpcSubscriptions,
    DefaultRpcSubscriptionsChannelConfig,
    DevnetUrl,
    extendClient,
    MainnetUrl,
    MicroLamports,
    pipe,
} from '@solana/kit';
import { planAndSendTransactions } from '@solana/kit-plugin-instruction-plan';

import { rpcAirdrop } from './airdrop';
import { rpcGetMinimumBalance } from './get-minimum-balance';
import { rpcConnection, rpcSubscriptionsConnection } from './rpc';
import { rpcTransactionPlanExecutor } from './transaction-plan-executor';
import { rpcTransactionPlanner } from './transaction-planner';

/**
 * Configuration for the Solana RPC plugins.
 *
 * @typeParam TClusterUrl - The type of the RPC endpoint URL.
 */
export type SolanaRpcConfig<TClusterUrl extends ClusterUrl = ClusterUrl> = {
    /**
     * The maximum number of concurrent transaction executions allowed.
     * Defaults to 10.
     */
    maxConcurrency?: number;
    /**
     * The priority fees to set on transactions in micro-lamports per compute unit.
     * Defaults to no priority fees.
     */
    priorityFees?: MicroLamports;
    /** Optional configuration forwarded to {@link createSolanaRpc}. */
    rpcConfig?: Parameters<typeof createSolanaRpc>[1];
    /** Optional configuration forwarded to {@link createSolanaRpcSubscriptions}. */
    rpcSubscriptionsConfig?: Parameters<typeof createSolanaRpcSubscriptions>[1];
    /**
     * URL of the Solana RPC Subscriptions endpoint.
     * Defaults to the `rpcUrl` with the protocol changed from `http` to `ws`.
     */
    rpcSubscriptionsUrl?: TClusterUrl;
    /** URL of the Solana RPC endpoint. */
    rpcUrl: TClusterUrl;
    /**
     * Whether to skip the preflight simulation when sending transactions.
     *
     * When `false` (default), preflight is skipped only if a compute unit
     * estimation simulation was already performed for that transaction.
     *
     * When `true`, preflight is always skipped and the transaction is sent
     * directly to the validator.
     *
     * Defaults to `false`.
     */
    skipPreflight?: boolean;
};

/**
 * Enhances a client with a full Solana RPC setup including RPC connection,
 * RPC Subscriptions, minimum balance computation, transaction planning, and
 * transaction execution.
 *
 * The client must have a `payer` set before applying this plugin.
 *
 * @param config - Configuration for the Solana RPC connection.
 * @return A plugin that adds `client.rpc`, `client.rpcSubscriptions`,
 * `client.getMinimumBalance`, `client.transactionPlanner`,
 * `client.transactionPlanExecutor`, and `client.sendTransactions`.
 *
 * @example
 * ```ts
 * import { createClient } from '@solana/kit';
 * import { solanaRpc } from '@solana/kit-plugin-rpc';
 * import { payer } from '@solana/kit-plugin-payer';
 *
 * const client = createClient()
 *     .use(payer(myPayer))
 *     .use(solanaRpc({ rpcUrl: 'https://api.mainnet-beta.solana.com' }));
 * ```
 *
 * @see {@link solanaMainnetRpc}
 * @see {@link solanaDevnetRpc}
 * @see {@link solanaLocalRpc}
 */
export function solanaRpc<TClusterUrl extends ClusterUrl>(config: SolanaRpcConfig<TClusterUrl>) {
    return <T extends ClientWithPayer>(client: T) =>
        pipe(
            client,
            solanaRpcConnection<TClusterUrl>(config.rpcUrl, config.rpcConfig),
            solanaRpcSubscriptionsConnection<TClusterUrl>(
                config.rpcSubscriptionsUrl ?? (config.rpcUrl.replace(/^http/, 'ws') as TClusterUrl),
                config.rpcSubscriptionsConfig,
            ),
            rpcGetMinimumBalance(),
            rpcTransactionPlanner({ priorityFees: config.priorityFees }),
            rpcTransactionPlanExecutor({ maxConcurrency: config.maxConcurrency, skipPreflight: config.skipPreflight }),
            planAndSendTransactions(),
        );
}

/**
 * Enhances a client with a full Solana mainnet RPC setup.
 *
 * This is a convenience wrapper around {@link solanaRpc} that types the
 * connection as a mainnet URL, preventing accidental use of devnet-only
 * features such as airdrops.
 *
 * @param config - Configuration for the Solana RPC connection.
 * @return A plugin that applies {@link solanaRpc} with a mainnet URL type.
 *
 * @example
 * ```ts
 * import { createClient } from '@solana/kit';
 * import { solanaMainnetRpc } from '@solana/kit-plugin-rpc';
 * import { payer } from '@solana/kit-plugin-payer';
 *
 * const client = createClient()
 *     .use(payer(myPayer))
 *     .use(solanaMainnetRpc({ rpcUrl: 'https://api.mainnet-beta.solana.com' }));
 * ```
 *
 * @see {@link solanaRpc}
 * @see {@link solanaDevnetRpc}
 * @see {@link solanaLocalRpc}
 */
export function solanaMainnetRpc(config: SolanaRpcConfig<string>) {
    return <T extends ClientWithPayer>(client: T) =>
        pipe(client, solanaRpc<MainnetUrl>(config as SolanaRpcConfig<MainnetUrl>));
}

/**
 * Enhances a client with a full Solana devnet RPC setup.
 *
 * This is a convenience wrapper around {@link solanaRpc} that defaults to
 * the public devnet endpoint and includes {@link rpcAirdrop} for requesting
 * SOL from the faucet.
 *
 * @param config - Optional configuration overrides. Defaults `rpcUrl` to
 * `https://api.devnet.solana.com`.
 * @return A plugin that applies {@link solanaRpc} with a devnet URL type
 * and airdrop support.
 *
 * @example
 * ```ts
 * import { createClient } from '@solana/kit';
 * import { solanaDevnetRpc } from '@solana/kit-plugin-rpc';
 * import { payerFromFile } from '@solana/kit-plugin-payer';
 *
 * const client = createClient()
 *     .use(payerFromFile("~/.config/solana/id.json"))
 *     .use(solanaDevnetRpc());
 * ```
 *
 * @see {@link solanaRpc}
 * @see {@link solanaMainnetRpc}
 * @see {@link solanaLocalRpc}
 */
export function solanaDevnetRpc(config?: Partial<SolanaRpcConfig<string>>) {
    return <T extends ClientWithPayer>(client: T) =>
        pipe(
            client,
            solanaRpc<DevnetUrl>({
                ...config,
                rpcUrl: config?.rpcUrl ?? 'https://api.devnet.solana.com',
            } as SolanaRpcConfig<DevnetUrl>),
            rpcAirdrop(),
        );
}

/**
 * Enhances a client with a full Solana local validator RPC setup.
 *
 * This is a convenience wrapper around {@link solanaRpc} that defaults to
 * `http://127.0.0.1:8899` for the RPC and `ws://127.0.0.1:8900` for
 * subscriptions, and includes {@link rpcAirdrop} for requesting SOL from
 * the faucet.
 *
 * @param config - Optional configuration overrides.
 * @return A plugin that applies {@link solanaRpc} with localhost defaults
 * and airdrop support.
 *
 * @example
 * ```ts
 * import { createClient } from '@solana/kit';
 * import { solanaLocalRpc } from '@solana/kit-plugin-rpc';
 * import { payerFromFile } from '@solana/kit-plugin-payer';
 *
 * const client = createClient()
 *     .use(payerFromFile("~/.config/solana/id.json"))
 *     .use(solanaLocalRpc());
 * ```
 *
 * @see {@link solanaRpc}
 * @see {@link solanaMainnetRpc}
 * @see {@link solanaDevnetRpc}
 */
export function solanaLocalRpc(config?: Partial<SolanaRpcConfig<string>>) {
    return <T extends ClientWithPayer>(client: T) =>
        pipe(
            client,
            solanaRpc({
                ...config,
                rpcSubscriptionsUrl: config?.rpcSubscriptionsUrl ?? 'ws://127.0.0.1:8900',
                rpcUrl: config?.rpcUrl ?? 'http://127.0.0.1:8899',
            }),
            rpcAirdrop(),
        );
}

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
