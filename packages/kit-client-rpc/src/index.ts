import {
    ClusterUrl,
    createClient as createEmptyClient,
    DefaultRpcSubscriptionsChannelConfig,
    MicroLamports,
    TransactionSigner,
} from '@solana/kit';
import { planAndSendTransactions } from '@solana/kit-plugin-instruction-plan';
import { payer, payerOrGeneratedPayer } from '@solana/kit-plugin-payer';
import {
    localhostRpc,
    rpc,
    rpcAirdrop,
    rpcGetMinimumBalance,
    rpcTransactionPlanExecutor,
    rpcTransactionPlanner,
} from '@solana/kit-plugin-rpc';

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
 * @deprecated Add a payer to your client using any payer plugin from
 * `@solana/kit-plugin-payer`, then use `solanaRpc` from `@solana/kit-plugin-rpc`.
 * ```ts
 * import { createClient } from '@solana/kit';
 * import { solanaRpc } from '@solana/kit-plugin-rpc';
 * import { payer } from '@solana/kit-plugin-payer';
 *
 * const client = createClient()
 *     .use(payer(myPayer))
 *     .use(solanaRpc({ rpcUrl: 'https://api.mainnet-beta.solana.com' }));
 * ```
 */
export function createClient<TClusterUrl extends ClusterUrl>(config: ClientConfig<TClusterUrl>) {
    return createEmptyClient()
        .use(rpc<TClusterUrl>(config.url, config.rpcSubscriptionsConfig))
        .use(payer(config.payer))
        .use(rpcGetMinimumBalance())
        .use(rpcTransactionPlanner({ priorityFees: config.priorityFees }))
        .use(rpcTransactionPlanExecutor({ maxConcurrency: config.maxConcurrency, skipPreflight: config.skipPreflight }))
        .use(planAndSendTransactions());
}

/**
 * Creates a default RPC client configured for localhost development.
 *
 * @deprecated Add a payer to your client using any payer plugin from
 * `@solana/kit-plugin-payer`, then use `solanaLocalRpc` from `@solana/kit-plugin-rpc`.
 * ```ts
 * import { createClient } from '@solana/kit';
 * import { solanaLocalRpc } from '@solana/kit-plugin-rpc';
 * import { payerFromFile } from '@solana/kit-plugin-payer';
 *
 * const client = createClient()
 *     .use(payerFromFile('~/.config/solana/id.json'))
 *     .use(solanaLocalRpc());
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
        .use(rpcAirdrop())
        .use(rpcGetMinimumBalance())
        .use(payerOrGeneratedPayer(config.payer))
        .use(rpcTransactionPlanner({ priorityFees: config.priorityFees }))
        .use(rpcTransactionPlanExecutor({ maxConcurrency: config.maxConcurrency, skipPreflight: config.skipPreflight }))
        .use(planAndSendTransactions());
}
