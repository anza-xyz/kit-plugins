import {
    ClientWithPayer,
    ClusterUrl,
    createSolanaRpc,
    createSolanaRpcSubscriptions,
    DefaultRpcSubscriptionsChannelConfig,
    DevnetUrl,
    extendClient,
    MainnetUrl,
    pipe,
    Rpc,
    RpcSubscriptions,
    SolanaRpcApiFromClusterUrl,
    SolanaRpcSubscriptionsApi,
} from '@solana/kit';
import { planAndSendTransactions } from '@solana/kit-plugin-instruction-plan';

import { rpcAirdrop } from './airdrop';
import { rpcGetMinimumBalance } from './get-minimum-balance';
import { rpcSubscriptionsConnection } from './rpc';
import { rpcTransactionPlanExecutor } from './transaction-plan-executor';
import { rpcTransactionPlanner, TransactionPlannerConfig } from './transaction-planner';

/**
 * Configuration for {@link solanaRpcConnection}.
 *
 * Describes the Solana RPC and RPC Subscriptions endpoints and any optional
 * transport configuration to forward to {@link createSolanaRpc} and
 * {@link createSolanaRpcSubscriptions}.
 *
 * @typeParam TClusterUrl - The type of the RPC endpoint URL.
 *
 * @example
 * ```ts
 * const config: SolanaRpcConnectionConfig = {
 *     rpcUrl: 'https://api.mainnet-beta.solana.com',
 *     rpcSubscriptionsUrl: 'wss://api.mainnet-beta.solana.com',
 * };
 * ```
 */
export type SolanaRpcConnectionConfig<TClusterUrl extends ClusterUrl = ClusterUrl> = {
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
};

/**
 * Configuration for the Solana RPC plugins.
 *
 * @typeParam TClusterUrl - The type of the RPC endpoint URL.
 */
export type SolanaRpcConfig<TClusterUrl extends ClusterUrl = ClusterUrl> = SolanaRpcConnectionConfig<TClusterUrl> & {
    /**
     * The maximum number of concurrent transaction executions allowed.
     * Defaults to 10.
     */
    maxConcurrency?: number;
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
    /**
     * Options to configure how transaction messages are created such as
     * choosing a transaction version or setting priority fees.
     */
    transactionConfig?: TransactionPlannerConfig;
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
            solanaRpcConnection<TClusterUrl>(config),
            rpcGetMinimumBalance(),
            rpcTransactionPlanner(config.transactionConfig),
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
 * Enhances a client with a Solana RPC connection and a Solana RPC Subscriptions
 * connection created from a cluster URL.
 *
 * This plugin creates both a Solana RPC using {@link createSolanaRpc} and Solana
 * RPC Subscriptions using {@link createSolanaRpcSubscriptions}, then installs
 * them on the client. When `rpcSubscriptionsUrl` is omitted, it is derived from
 * `rpcUrl` by swapping the `http`/`https` protocol for `ws`/`wss`.
 *
 * @param config - Configuration describing the RPC and subscriptions endpoints.
 * @return A plugin that adds `client.rpc` and `client.rpcSubscriptions`.
 *
 * @example
 * ```ts
 * import { createClient } from '@solana/kit';
 * import { solanaRpcConnection } from '@solana/kit-plugin-rpc';
 *
 * const client = createClient().use(solanaRpcConnection({ rpcUrl: 'https://api.mainnet-beta.solana.com' }));
 * const { value: latestBlockhash } = await client.rpc.getLatestBlockhash().send();
 * ```
 *
 * @example
 * Narrowing the RPC API to a specific cluster using `mainnet`, `devnet`, or
 * `testnet` helpers from `@solana/kit`:
 *
 * ```ts
 * import { createClient, mainnet } from '@solana/kit';
 * import { solanaRpcConnection } from '@solana/kit-plugin-rpc';
 *
 * const client = createClient().use(
 *     solanaRpcConnection({ rpcUrl: mainnet('https://api.mainnet-beta.solana.com') }),
 * );
 * ```
 *
 * @see {@link SolanaRpcConnectionConfig}
 * @see {@link solanaRpc}
 */
export function solanaRpcConnection<TClusterUrl extends ClusterUrl>(config: SolanaRpcConnectionConfig<TClusterUrl>) {
    const rpc = createSolanaRpc<TClusterUrl>(config.rpcUrl, config.rpcConfig);
    const rpcSubscriptionsUrl = config.rpcSubscriptionsUrl ?? (config.rpcUrl.replace(/^http/, 'ws') as TClusterUrl);
    const rpcSubscriptions = createSolanaRpcSubscriptions<TClusterUrl>(
        rpcSubscriptionsUrl,
        config.rpcSubscriptionsConfig,
    );
    return <T extends object>(
        client: T,
    ): Omit<T, 'rpc' | 'rpcSubscriptions'> & {
        rpc: Rpc<SolanaRpcApiFromClusterUrl<TClusterUrl>>;
        rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
    } => extendClient(client, { rpc, rpcSubscriptions });
}

/**
 * Enhances a client with a Solana RPC Subscriptions connection created from a cluster URL.
 *
 * @param url - The URL of the Solana cluster.
 * @param config - Optional configuration forwarded to {@link createSolanaRpcSubscriptions}.
 * @return A plugin that adds `client.rpcSubscriptions`.
 *
 * @deprecated {@link solanaRpcConnection} now installs both `rpc` and
 * `rpcSubscriptions`, so this dedicated helper is no longer needed. If you only
 * need subscriptions, inline a call to `extendClient` using
 * {@link createSolanaRpcSubscriptions}:
 *
 * ```ts
 * // Before
 * const client = createClient()
 *     .use(solanaRpcSubscriptionsConnection('wss://api.mainnet-beta.solana.com'));
 *
 * // After — full Solana RPC + subscriptions setup in a single plugin
 * const client = createClient()
 *     .use(solanaRpcConnection({ rpcUrl: 'https://api.mainnet-beta.solana.com' }));
 *
 * // Or — subscriptions only
 * import { createSolanaRpcSubscriptions, extendClient } from '@solana/kit';
 *
 * const rpcSubscriptions = createSolanaRpcSubscriptions('wss://api.mainnet-beta.solana.com');
 * const client = createClient().use(c => extendClient(c, { rpcSubscriptions }));
 * ```
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
 * @deprecated Use {@link solanaRpcConnection} instead.
 * ```ts
 * // Before
 * const client = createClient().use(rpc('https://api.mainnet-beta.solana.com'));
 *
 * // After
 * const client = createClient()
 *     .use(solanaRpcConnection({ rpcUrl: 'https://api.mainnet-beta.solana.com' }));
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
 * @deprecated Use {@link solanaRpcConnection} or {@link solanaLocalRpc} instead.
 * ```ts
 * // Before
 * const client = createClient().use(localhostRpc());
 *
 * // After
 * const client = createClient()
 *     .use(solanaRpcConnection({
 *         rpcUrl: 'http://127.0.0.1:8899',
 *         rpcSubscriptionsUrl: 'ws://127.0.0.1:8900',
 *     }));
 * ```
 */
export function localhostRpc(url?: string, rpcSubscriptionsConfig?: DefaultRpcSubscriptionsChannelConfig<string>) {
    return rpc<string>(url ?? 'http://127.0.0.1:8899', rpcSubscriptionsConfig ?? { url: 'ws://127.0.0.1:8900' });
}
