import {
    ClusterUrl,
    createEmptyClient,
    DefaultRpcSubscriptionsChannelConfig,
    MicroLamports,
    TransactionSigner,
} from '@solana/kit';
import { airdrop } from '@solana/kit-plugin-airdrop';
import { planAndSendTransactions } from '@solana/kit-plugin-instruction-plan';
import { payer, payerOrGeneratedPayer } from '@solana/kit-plugin-payer';
import { localhostRpc, rpc, rpcTransactionPlanExecutor, rpcTransactionPlanner } from '@solana/kit-plugin-rpc';

/**
 * Configuration options for RPC client factory functions.
 *
 * This type defines the shared configuration accepted by {@link createClient}
 * and {@link createLocalClient}. Options are forwarded to the underlying
 * transaction planner and executor plugins.
 *
 * @typeParam TClusterUrl - The type of the RPC endpoint URL.
 */
export type ClientConfig<TClusterUrl extends ClusterUrl = ClusterUrl> = {
    /**
     * The maximum number of concurrent transaction executions allowed.
     * Defaults to 10.
     */
    maxConcurrency?: number;
    /** The transaction signer who will pay for transaction fees. */
    payer: TransactionSigner;
    /**
     * The priority fees to set on transactions in micro-lamports per compute unit.
     * Defaults to no priority fees.
     */
    priorityFees?: MicroLamports;
    /** Configuration for RPC subscriptions. */
    rpcSubscriptionsConfig?: DefaultRpcSubscriptionsChannelConfig<TClusterUrl>;
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
    /** URL of the Solana RPC endpoint. */
    url: TClusterUrl;
};

/**
 * Creates a default RPC client with all essential plugins configured.
 *
 * This function sets up a client with RPC capabilities, payer configuration,
 * transaction planning and execution, and instruction plan sending functionality.
 * It's designed for production use with real Solana clusters.
 *
 * @param config - Configuration object containing the payer, URL, and optional RPC subscriptions config.
 * @returns A fully configured default client ready for transaction operations.
 *
 * @example
 * ```ts
 * import { createClient } from '@solana/kit-client-rpc';
 * import { generateKeyPairSigner } from '@solana/kit';
 *
 * const payer = await generateKeyPairSigner();
 * const client = createClient({
 *   url: 'https://api.mainnet-beta.solana.com',
 *   payer,
 * });
 *
 * // Use the client
 * const result = await client.sendTransaction([myInstruction]);
 * ```
 */
export function createClient<TClusterUrl extends ClusterUrl>(config: ClientConfig<TClusterUrl>) {
    return createEmptyClient()
        .use(rpc<TClusterUrl>(config.url, config.rpcSubscriptionsConfig))
        .use(payer(config.payer))
        .use(rpcTransactionPlanner({ priorityFees: config.priorityFees }))
        .use(rpcTransactionPlanExecutor({ maxConcurrency: config.maxConcurrency, skipPreflight: config.skipPreflight }))
        .use(planAndSendTransactions());
}

/**
 * Creates a default RPC client configured for localhost development.
 *
 * This function sets up a client connected to a local validator with airdrop
 * functionality, automatic payer generation (if not provided), and all essential
 * transaction capabilities. Perfect for local development and testing.
 *
 * @param config - Optional configuration object with an optional payer.
 * @returns A fully configured client ready for localhost development.
 *
 * @example
 * ```ts
 * import { createLocalClient } from '@solana/kit-client-rpc';
 *
 * // Creates a client with auto-generated and funded payer
 * const client = await createLocalClient();
 *
 * // Use the client
 * const result = await client.sendTransaction([myInstruction]);
 * console.log('Payer address:', client.payer.address);
 * ```
 *
 * @example
 * Using a custom payer.
 * ```ts
 * import { createLocalClient } from '@solana/kit-client-rpc';
 * import { generateKeyPairSigner } from '@solana/kit';
 *
 * const customPayer = await generateKeyPairSigner();
 * const client = await createLocalClient({ payer: customPayer });
 * ```
 */
export function createLocalClient(
    config: Omit<ClientConfig<string>, 'payer' | 'url'> & {
        /** Signer used to pay for transaction fees. Defaults to a generated and funded payer. */
        payer?: TransactionSigner;
        /** Custom RPC URL. Defaults to `http://127.0.0.1:8899`. */
        url?: string;
    } = {},
) {
    return createEmptyClient()
        .use(localhostRpc(config.url, config.rpcSubscriptionsConfig))
        .use(airdrop())
        .use(payerOrGeneratedPayer(config.payer))
        .use(rpcTransactionPlanner({ priorityFees: config.priorityFees }))
        .use(rpcTransactionPlanExecutor({ maxConcurrency: config.maxConcurrency, skipPreflight: config.skipPreflight }))
        .use(planAndSendTransactions());
}
